-- The Pix of an account statement a settlement is (ADR 0065 note of 2026-11-04): the movement's
-- identifier, and the import that created or matched it.
-- AlterTable
ALTER TABLE "person_settlements" ADD COLUMN     "external_id" VARCHAR(100),
ADD COLUMN     "import_id" UUID,
ADD COLUMN     "reconciled_import_id" UUID;

-- CreateIndex
CREATE INDEX "person_settlements_import_id_idx" ON "person_settlements"("import_id");

-- CreateIndex
CREATE INDEX "person_settlements_reconciled_import_id_idx" ON "person_settlements"("reconciled_import_id");

-- CreateIndex
CREATE UNIQUE INDEX "person_settlements_workspace_id_external_id_key" ON "person_settlements"("workspace_id", "external_id");

-- AddForeignKey
ALTER TABLE "person_settlements" ADD CONSTRAINT "person_settlements_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_settlements" ADD CONSTRAINT "person_settlements_reconciled_import_id_fkey" FOREIGN KEY ("reconciled_import_id") REFERENCES "imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

