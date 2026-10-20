-- AlterTable
ALTER TABLE "installment_plans" ADD COLUMN     "first_number" SMALLINT NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "merchant_aliases" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "alias" VARCHAR(100) NOT NULL,
    "normalized" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "merchant_aliases_merchant_id_idx" ON "merchant_aliases"("merchant_id");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_aliases_workspace_id_normalized_key" ON "merchant_aliases"("workspace_id", "normalized");

-- AddForeignKey
ALTER TABLE "merchant_aliases" ADD CONSTRAINT "merchant_aliases_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_aliases" ADD CONSTRAINT "merchant_aliases_merchant_id_workspace_id_fkey" FOREIGN KEY ("merchant_id", "workspace_id") REFERENCES "merchants"("id", "workspace_id") ON DELETE CASCADE ON UPDATE NO ACTION;


-- The first installment created is one of the plan's (ADR 0055).
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_first_number_range" CHECK (
  "first_number" >= 1 AND "first_number" <= "installments"
);

-- Row Level Security (ADR 0028), added by hand: Prisma does not manage policies.
ALTER TABLE "merchant_aliases" ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON "merchant_aliases"
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);
