-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "external_id" VARCHAR(100),
ADD COLUMN     "reconciled_import_id" UUID;

-- CreateIndex
CREATE INDEX "transactions_reconciled_import_id_idx" ON "transactions"("reconciled_import_id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_workspace_id_external_id_key" ON "transactions"("workspace_id", "external_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_reconciled_import_id_fkey" FOREIGN KEY ("reconciled_import_id") REFERENCES "imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- An account statement may only settle or link transactions already in the app (ADR 0061):
-- such an import creates none.
ALTER TABLE "imports" DROP CONSTRAINT "imports_transaction_count_positive";
ALTER TABLE "imports" ADD CONSTRAINT "imports_transaction_count_not_negative" CHECK ("transaction_count" >= 0);
