-- CreateTable
CREATE TABLE "recurrences" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "type" "transaction_type" NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "notes" VARCHAR(1000),
    "category_id" UUID NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "due_day" SMALLINT,
    "start_period" CHAR(7) NOT NULL,
    "end_period" CHAR(7),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "recurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurrence_occurrences" (
    "recurrence_id" UUID NOT NULL,
    "period" CHAR(7) NOT NULL,
    "workspace_id" UUID NOT NULL,
    "transaction_id" UUID,

    CONSTRAINT "recurrence_occurrences_pkey" PRIMARY KEY ("recurrence_id","period")
);

-- CreateIndex
CREATE INDEX "recurrences_workspace_id_idx" ON "recurrences"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "recurrence_occurrences_transaction_id_key" ON "recurrence_occurrences"("transaction_id");

-- CreateIndex
CREATE INDEX "recurrence_occurrences_workspace_id_period_idx" ON "recurrence_occurrences"("workspace_id", "period");

-- AddForeignKey
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_category_id_workspace_id_type_fkey" FOREIGN KEY ("category_id", "workspace_id", "type") REFERENCES "categories"("id", "workspace_id", "type") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "recurrence_occurrences" ADD CONSTRAINT "recurrence_occurrences_recurrence_id_fkey" FOREIGN KEY ("recurrence_id") REFERENCES "recurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurrence_occurrences" ADD CONSTRAINT "recurrence_occurrences_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurrence_occurrences" ADD CONSTRAINT "recurrence_occurrences_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Rules the database enforces by itself, added by hand (ADRs 0010, 0029 and 0038): positive
-- amount, a real day of the month, real competências, and no end before the start.
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_amount_cents_positive" CHECK ("amount_cents" > 0);
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_due_day_range" CHECK ("due_day" BETWEEN 1 AND 31);
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_start_period_format" CHECK ("start_period" ~ '^\d{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_end_period_format" CHECK ("end_period" ~ '^\d{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_end_after_start" CHECK ("end_period" >= "start_period");
ALTER TABLE "recurrence_occurrences" ADD CONSTRAINT "recurrence_occurrences_period_format" CHECK ("period" ~ '^\d{4}-(0[1-9]|1[0-2])$');

-- Row Level Security (ADR 0028), added by hand: Prisma does not manage policies.
ALTER TABLE "recurrences" ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON "recurrences"
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

ALTER TABLE "recurrence_occurrences" ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON "recurrence_occurrences"
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);
