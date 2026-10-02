-- CreateTable
CREATE TABLE "budget_configs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "period" CHAR(7) NOT NULL,
    "net_income_cents" INTEGER NOT NULL,
    "gross_income_cents" INTEGER,
    "expenses_bp" INTEGER NOT NULL,
    "investments_bp" INTEGER NOT NULL,
    "emergency_reserve_bp" INTEGER NOT NULL,
    "travel_bp" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "budget_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "budget_configs_workspace_id_period_key" ON "budget_configs"("workspace_id", "period");

-- AddForeignKey
ALTER TABLE "budget_configs" ADD CONSTRAINT "budget_configs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Rules the database enforces by itself, added by hand (ADRs 0010 and 0030): a real competência,
-- incomes that are not negative, and percentages from 0 to 100% that add up to at most 100%.
ALTER TABLE "budget_configs" ADD CONSTRAINT "budget_configs_period_format" CHECK ("period" ~ '^\d{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "budget_configs" ADD CONSTRAINT "budget_configs_income_valid" CHECK ("net_income_cents" >= 0 AND ("gross_income_cents" IS NULL OR "gross_income_cents" > 0));
ALTER TABLE "budget_configs" ADD CONSTRAINT "budget_configs_shares_valid" CHECK (
  "expenses_bp" BETWEEN 0 AND 10000
  AND "investments_bp" BETWEEN 0 AND 10000
  AND "emergency_reserve_bp" BETWEEN 0 AND 10000
  AND "travel_bp" BETWEEN 0 AND 10000
  AND "expenses_bp" + "investments_bp" + "emergency_reserve_bp" + "travel_bp" <= 10000
);

-- Row Level Security (ADR 0028), added by hand: Prisma does not manage policies.
ALTER TABLE "budget_configs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON "budget_configs"
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);
