-- CreateTable
CREATE TABLE "period_closings" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "period" CHAR(7) NOT NULL,
    "closed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_by" UUID,
    "reopened_at" TIMESTAMPTZ(3),
    "reopened_by" UUID,
    "reopen_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "period_closings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "period_closings_workspace_id_period_idx" ON "period_closings"("workspace_id", "period");

-- CreateIndex
CREATE INDEX "period_closings_closed_by_idx" ON "period_closings"("closed_by");

-- CreateIndex
CREATE INDEX "period_closings_reopened_by_idx" ON "period_closings"("reopened_by");

-- AddForeignKey
ALTER TABLE "period_closings" ADD CONSTRAINT "period_closings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "period_closings" ADD CONSTRAINT "period_closings_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "period_closings" ADD CONSTRAINT "period_closings_reopened_by_fkey" FOREIGN KEY ("reopened_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Added by hand (ADR 0063). A closing is of a competência, and a reopening says why.
ALTER TABLE "period_closings" ADD CONSTRAINT "period_closings_period_format" CHECK ("period" ~ '^\d{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "period_closings" ADD CONSTRAINT "period_closings_reopen_check" CHECK (("reopened_at" IS NULL) = ("reopen_reason" IS NULL));

-- Row Level Security (ADR 0028), added by hand: Prisma does not manage policies.
ALTER TABLE "period_closings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON "period_closings"
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

-- The lock of a closed competência (ADR 0063), backing the services: whatever writes into it
-- fails with SQLSTATE FC001 and the competência in DETAIL, which the API answers with 409
-- PERIOD_CLOSED. The functions run as their owner (SECURITY DEFINER), so they see every closing
-- whatever the RLS context, and they fix search_path, as a SECURITY DEFINER function must.
CREATE FUNCTION period_is_closed(p_workspace_id uuid, p_period text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM period_closings
    WHERE workspace_id = p_workspace_id AND period = p_period AND reopened_at IS NULL
  )
$$;

CREATE FUNCTION raise_period_closed(p_period text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'competência % fechada', p_period USING ERRCODE = 'FC001', DETAIL = p_period;
END
$$;

-- The cascade of a deleted workspace (or account) reaches its rows after the workspace is gone.
CREATE FUNCTION workspace_exists(p_workspace_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM workspaces WHERE id = p_workspace_id)
$$;

CREATE FUNCTION transactions_period_lock() RETURNS trigger
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
    -- Links only, which change no amount: an import forgotten or undone, a split one deleted.
    IF (to_jsonb(NEW) - ARRAY['import_id', 'reconciled_import_id', 'split_of_id', 'updated_at'])
       = (to_jsonb(OLD) - ARRAY['import_id', 'reconciled_import_id', 'split_of_id', 'updated_at']) THEN
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

CREATE TRIGGER transactions_period_lock BEFORE INSERT OR UPDATE OR DELETE ON "transactions"
  FOR EACH ROW EXECUTE FUNCTION transactions_period_lock();

CREATE FUNCTION budget_configs_period_lock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND NOT workspace_exists(OLD.workspace_id) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP <> 'INSERT' AND period_is_closed(OLD.workspace_id, OLD.period) THEN
    PERFORM raise_period_closed(OLD.period);
  END IF;
  IF TG_OP <> 'DELETE' AND period_is_closed(NEW.workspace_id, NEW.period) THEN
    PERFORM raise_period_closed(NEW.period);
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER budget_configs_period_lock BEFORE INSERT OR UPDATE OR DELETE ON "budget_configs"
  FOR EACH ROW EXECUTE FUNCTION budget_configs_period_lock();

-- A share has no period of its own: it is its budget's. A share deleted with its budget passes,
-- since the budget itself was checked.
CREATE FUNCTION budget_shares_period_lock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  config_period text;
BEGIN
  IF TG_OP = 'DELETE' AND NOT workspace_exists(OLD.workspace_id) THEN RETURN OLD; END IF;
  IF TG_OP <> 'INSERT' THEN
    SELECT period INTO config_period FROM budget_configs WHERE id = OLD.budget_config_id;
    IF config_period IS NOT NULL AND period_is_closed(OLD.workspace_id, config_period) THEN
      PERFORM raise_period_closed(config_period);
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT period INTO config_period FROM budget_configs WHERE id = NEW.budget_config_id;
    IF period_is_closed(NEW.workspace_id, config_period) THEN PERFORM raise_period_closed(config_period); END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END
$$;

CREATE TRIGGER budget_shares_period_lock BEFORE INSERT OR UPDATE OR DELETE ON "budget_shares"
  FOR EACH ROW EXECUTE FUNCTION budget_shares_period_lock();
