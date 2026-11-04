-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "settlement_id" UUID;

-- CreateTable
CREATE TABLE "person_settlements" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "settled_at" DATE NOT NULL,
    "debit_cents" INTEGER NOT NULL,
    "credit_cents" INTEGER NOT NULL,
    "reward_transaction_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "person_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "person_settlements_reward_transaction_id_key" ON "person_settlements"("reward_transaction_id");

-- CreateIndex
CREATE INDEX "person_settlements_workspace_id_person_id_idx" ON "person_settlements"("workspace_id", "person_id");

-- CreateIndex
CREATE INDEX "person_settlements_created_by_idx" ON "person_settlements"("created_by");

-- CreateIndex
CREATE INDEX "transactions_settlement_id_idx" ON "transactions"("settlement_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "person_settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_settlements" ADD CONSTRAINT "person_settlements_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_settlements" ADD CONSTRAINT "person_settlements_person_id_workspace_id_fkey" FOREIGN KEY ("person_id", "workspace_id") REFERENCES "people"("id", "workspace_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "person_settlements" ADD CONSTRAINT "person_settlements_reward_transaction_id_fkey" FOREIGN KEY ("reward_transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_settlements" ADD CONSTRAINT "person_settlements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Added by hand (ADR 0065). A settlement has at least one debit; the totals are never negative.
ALTER TABLE "person_settlements" ADD CONSTRAINT "person_settlements_amounts_check"
  CHECK ("debit_cents" > 0 AND "credit_cents" >= 0);

-- Only a settled transaction belongs to a settlement.
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_settlement_check"
  CHECK ("settlement_id" IS NULL OR "settled_at" IS NOT NULL);

-- Row Level Security (ADR 0028), added by hand: Prisma does not manage policies.
ALTER TABLE "person_settlements" ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON "person_settlements"
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

-- A transaction back to pending, by any path (the form, a bill undone, an import undone), leaves
-- its settlement: the settlement keeps its totals, which are what changed hands that day.
CREATE FUNCTION transactions_settlement_follows() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.settled_at IS NULL THEN NEW.settlement_id := NULL; END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER transactions_settlement_follows BEFORE UPDATE OF settled_at ON "transactions"
  FOR EACH ROW EXECUTE FUNCTION transactions_settlement_follows();

-- The period lock (ADR 0063) takes settlement_id as a link, like import_id: a settlement undone
-- clears it (ON DELETE SET NULL) without changing any amount. The rest is the same function.
CREATE OR REPLACE FUNCTION transactions_period_lock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF period_is_closed(NEW.workspace_id, NEW.period) THEN PERFORM raise_period_closed(NEW.period); END IF;
    RETURN NEW;
  END IF;
  IF NOT workspace_exists(OLD.workspace_id) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    -- Links only, which change no amount: an import forgotten or undone, a split one deleted, a
    -- settlement undone.
    IF (to_jsonb(NEW) - ARRAY['import_id', 'reconciled_import_id', 'split_of_id', 'settlement_id', 'updated_at'])
       = (to_jsonb(OLD) - ARRAY['import_id', 'reconciled_import_id', 'split_of_id', 'settlement_id', 'updated_at']) THEN
      RETURN NEW;
    END IF;
    -- A pending one with no due date (a loan, ADR 0057) settled in part: only its amount changes.
    IF OLD.settled_at IS NULL AND OLD.due_date IS NULL
       AND (to_jsonb(NEW) - ARRAY['amount_cents', 'updated_at'])
         = (to_jsonb(OLD) - ARRAY['amount_cents', 'updated_at']) THEN
      RETURN NEW;
    END IF;
  ELSIF OLD.settled_at IS NULL AND OLD.due_date IS NULL THEN
    -- The same loan settled in full: the part is launched in an open month, the pending one goes.
    RETURN OLD;
  END IF;
  IF period_is_closed(OLD.workspace_id, OLD.period) THEN PERFORM raise_period_closed(OLD.period); END IF;
  IF TG_OP = 'UPDATE' AND NEW.period <> OLD.period AND period_is_closed(NEW.workspace_id, NEW.period) THEN
    PERFORM raise_period_closed(NEW.period);
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;
