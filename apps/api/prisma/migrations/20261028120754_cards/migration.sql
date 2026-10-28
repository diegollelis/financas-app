-- AlterTable
ALTER TABLE "imports" ADD COLUMN     "card_id" UUID;

-- AlterTable
ALTER TABLE "installment_plans" ADD COLUMN     "card_id" UUID;

-- AlterTable
ALTER TABLE "recurrences" ADD COLUMN     "card_id" UUID;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "card_id" UUID;

-- CreateTable
CREATE TABLE "cards" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "bank" "StatementBank",
    "credit" BOOLEAN NOT NULL DEFAULT false,
    "debit" BOOLEAN NOT NULL DEFAULT false,
    "closing_day" SMALLINT,
    "due_day" SMALLINT,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cards_workspace_id_name_key" ON "cards"("workspace_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "cards_id_workspace_id_key" ON "cards"("id", "workspace_id");

-- CreateIndex
CREATE INDEX "transactions_card_id_idx" ON "transactions"("card_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_card_id_workspace_id_fkey" FOREIGN KEY ("card_id", "workspace_id") REFERENCES "cards"("id", "workspace_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imports" ADD CONSTRAINT "imports_card_id_workspace_id_fkey" FOREIGN KEY ("card_id", "workspace_id") REFERENCES "cards"("id", "workspace_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_card_id_workspace_id_fkey" FOREIGN KEY ("card_id", "workspace_id") REFERENCES "cards"("id", "workspace_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_card_id_workspace_id_fkey" FOREIGN KEY ("card_id", "workspace_id") REFERENCES "cards"("id", "workspace_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Added by hand (ADR 0062). A card does something, and only a credit card has the days of its
-- bill, both of them, each a day of the month.
ALTER TABLE "cards" ADD CONSTRAINT "cards_function_check" CHECK ("credit" OR "debit");
ALTER TABLE "cards" ADD CONSTRAINT "cards_bill_days_check" CHECK (
  ("credit" AND "closing_day" BETWEEN 1 AND 31 AND "due_day" BETWEEN 1 AND 31)
  OR (NOT "credit" AND "closing_day" IS NULL AND "due_day" IS NULL)
);

-- A card goes only with the Crédito or Débito methods; which function it has is checked by the API.
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_card_method_check"
  CHECK ("card_id" IS NULL OR "payment_method" IN ('CREDIT_CARD', 'DEBIT_CARD'));
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_card_method_check"
  CHECK ("card_id" IS NULL OR "payment_method" IN ('CREDIT_CARD', 'DEBIT_CARD'));
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_card_method_check"
  CHECK ("card_id" IS NULL OR "payment_method" IN ('CREDIT_CARD', 'DEBIT_CARD'));

-- Row Level Security (ADR 0028), added by hand: Prisma does not manage policies.
ALTER TABLE "cards" ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON "cards"
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);
