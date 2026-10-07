-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "import_id" UUID;

-- CreateTable
CREATE TABLE "imports" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "created_by" UUID,
    "transaction_count" INTEGER NOT NULL,
    "first_period" CHAR(7) NOT NULL,
    "last_period" CHAR(7) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "imports_workspace_id_created_at_idx" ON "imports"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "transactions_import_id_idx" ON "transactions"("import_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imports" ADD CONSTRAINT "imports_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imports" ADD CONSTRAINT "imports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Rules the database enforces by itself, added by hand (ADRs 0010 and 0040): an import brings at
-- least one transaction, and its competências are real months in order.
ALTER TABLE "imports" ADD CONSTRAINT "imports_transaction_count_positive" CHECK ("transaction_count" > 0);
ALTER TABLE "imports" ADD CONSTRAINT "imports_first_period_format" CHECK ("first_period" ~ '^\d{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "imports" ADD CONSTRAINT "imports_last_period_format" CHECK ("last_period" ~ '^\d{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "imports" ADD CONSTRAINT "imports_periods_in_order" CHECK ("first_period" <= "last_period");

-- Row Level Security (ADR 0028), added by hand: Prisma does not manage policies.
ALTER TABLE "imports" ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON "imports"
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);
