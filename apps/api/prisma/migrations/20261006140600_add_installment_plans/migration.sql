-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "installment_number" SMALLINT,
ADD COLUMN     "installment_plan_id" UUID;

-- CreateTable
CREATE TABLE "installment_plans" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "type" "transaction_type" NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "notes" VARCHAR(1000),
    "category_id" UUID NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "installments" SMALLINT NOT NULL,
    "first_period" CHAR(7) NOT NULL,
    "due_day" SMALLINT,
    "ended_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "installment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "installment_plans_workspace_id_idx" ON "installment_plans"("workspace_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_installment_plan_id_fkey" FOREIGN KEY ("installment_plan_id") REFERENCES "installment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_category_id_workspace_id_type_fkey" FOREIGN KEY ("category_id", "workspace_id", "type") REFERENCES "categories"("id", "workspace_id", "type") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Rules the database enforces by itself, added by hand (ADRs 0010, 0029 and 0038): positive
-- total, 2 to 72 installments, a real first competência and due day; an installment knows its
-- plan and its number together, and a plan never has the same number twice.
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_total_cents_positive" CHECK ("total_cents" > 0);
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_installments_range" CHECK ("installments" BETWEEN 2 AND 72);
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_first_period_format" CHECK ("first_period" ~ '^\d{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_due_day_range" CHECK ("due_day" BETWEEN 1 AND 31);
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_installment_both_or_neither" CHECK (("installment_plan_id" IS NULL) = ("installment_number" IS NULL));
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_installment_number_positive" CHECK ("installment_number" >= 1);
CREATE UNIQUE INDEX "transactions_installment_plan_id_installment_number_key" ON "transactions"("installment_plan_id", "installment_number");

-- Row Level Security (ADR 0028), added by hand: Prisma does not manage policies.
ALTER TABLE "installment_plans" ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON "installment_plans"
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);
