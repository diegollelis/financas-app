-- The shares of each saved budget become rows, one per destination (ADR 0047). Order matters:
-- create the table, copy the four fixed percentages into it, and only then drop their columns.

-- CreateTable
CREATE TABLE "budget_shares" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "budget_config_id" UUID NOT NULL,
    "destination_id" UUID NOT NULL,
    "basis_points" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "budget_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "budget_shares_destination_id_idx" ON "budget_shares"("destination_id");

-- CreateIndex
CREATE UNIQUE INDEX "budget_shares_budget_config_id_destination_id_key" ON "budget_shares"("budget_config_id", "destination_id");

-- CreateIndex
CREATE UNIQUE INDEX "budget_destinations_id_workspace_id_key" ON "budget_destinations"("id", "workspace_id");

-- AddForeignKey
ALTER TABLE "budget_shares" ADD CONSTRAINT "budget_shares_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_shares" ADD CONSTRAINT "budget_shares_budget_config_id_fkey" FOREIGN KEY ("budget_config_id") REFERENCES "budget_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_shares" ADD CONSTRAINT "budget_shares_destination_id_workspace_id_fkey" FOREIGN KEY ("destination_id", "workspace_id") REFERENCES "budget_destinations"("id", "workspace_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Rules the database enforces by itself, added by hand: a share is between 0% and 100%.
ALTER TABLE "budget_shares" ADD CONSTRAINT "budget_shares_basis_points_range" CHECK ("basis_points" BETWEEN 0 AND 10000);

-- Row Level Security (ADR 0028), added by hand: Prisma does not manage policies.
ALTER TABLE "budget_shares" ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON "budget_shares"
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

-- Copy every saved budget's four percentages into its rows, with the same numbers. Despesas is
-- the workspace's EXPENSES destination; the other three, the default saving destinations by
-- name (created by the previous migration). The three saving ones now mean a share of what is
-- left after expenses instead of a share of the income: the owner reviews them (ADR 0047).
INSERT INTO "budget_shares" ("id", "workspace_id", "budget_config_id", "destination_id", "basis_points", "updated_at")
SELECT uuidv7(), b.workspace_id, b.id, d.id, v.basis_points, CURRENT_TIMESTAMP
FROM "budget_configs" b
CROSS JOIN LATERAL (
  VALUES
    ('EXPENSES', NULL, b.expenses_bp),
    ('SAVINGS', 'Investimentos', b.investments_bp),
    ('SAVINGS', 'Reserva de emergência', b.emergency_reserve_bp),
    ('SAVINGS', 'Viagens', b.travel_bp)
) AS v(kind, name, basis_points)
JOIN "budget_destinations" d
  ON d.workspace_id = b.workspace_id
  AND d.kind = v.kind::"budget_destination_kind"
  AND (v.name IS NULL OR d.name = v.name);

-- AlterTable: the fixed percentages and the gross income go. Dropping the columns also drops
-- the CHECKs that read them (budget_configs_income_valid, budget_configs_shares_valid).
ALTER TABLE "budget_configs" DROP COLUMN "emergency_reserve_bp",
DROP COLUMN "expenses_bp",
DROP COLUMN "gross_income_cents",
DROP COLUMN "investments_bp",
DROP COLUMN "travel_bp";

-- The income rule that went with the dropped CHECK: the net income is never negative.
ALTER TABLE "budget_configs" ADD CONSTRAINT "budget_configs_net_income_valid" CHECK ("net_income_cents" >= 0);
