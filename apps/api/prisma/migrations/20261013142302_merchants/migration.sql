-- AlterTable
ALTER TABLE "installment_plans" ADD COLUMN     "merchant_id" UUID;

-- AlterTable
ALTER TABLE "recurrences" ADD COLUMN     "merchant_id" UUID;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "merchant_id" UUID;

-- CreateTable
CREATE TABLE "merchants" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "merchants_workspace_id_name_key" ON "merchants"("workspace_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "merchants_id_workspace_id_key" ON "merchants"("id", "workspace_id");

-- CreateIndex
CREATE INDEX "transactions_merchant_id_idx" ON "transactions"("merchant_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_merchant_id_workspace_id_fkey" FOREIGN KEY ("merchant_id", "workspace_id") REFERENCES "merchants"("id", "workspace_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_merchant_id_workspace_id_fkey" FOREIGN KEY ("merchant_id", "workspace_id") REFERENCES "merchants"("id", "workspace_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_merchant_id_workspace_id_fkey" FOREIGN KEY ("merchant_id", "workspace_id") REFERENCES "merchants"("id", "workspace_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Row Level Security (ADR 0028), added by hand: Prisma does not manage policies.
ALTER TABLE "merchants" ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON "merchants"
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);
