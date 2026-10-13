-- CreateTable
CREATE TABLE "recurrence_shares" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "recurrence_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "amount_cents" INTEGER,
    "basis_points" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recurrence_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recurrence_shares_workspace_id_idx" ON "recurrence_shares"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "recurrence_shares_recurrence_id_person_id_key" ON "recurrence_shares"("recurrence_id", "person_id");

-- AddForeignKey
ALTER TABLE "recurrence_shares" ADD CONSTRAINT "recurrence_shares_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurrence_shares" ADD CONSTRAINT "recurrence_shares_recurrence_id_fkey" FOREIGN KEY ("recurrence_id") REFERENCES "recurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurrence_shares" ADD CONSTRAINT "recurrence_shares_person_id_workspace_id_fkey" FOREIGN KEY ("person_id", "workspace_id") REFERENCES "people"("id", "workspace_id") ON DELETE NO ACTION ON UPDATE NO ACTION;


-- Rules the database enforces by itself, added by hand (ADR 0052): a share is a fixed amount or a
-- percentage of each month's amount, exactly one of them, and never zero.
ALTER TABLE "recurrence_shares" ADD CONSTRAINT "recurrence_shares_amount_or_percent" CHECK (
  ("amount_cents" IS NULL) <> ("basis_points" IS NULL)
);
ALTER TABLE "recurrence_shares" ADD CONSTRAINT "recurrence_shares_amount_positive" CHECK ("amount_cents" > 0);
ALTER TABLE "recurrence_shares" ADD CONSTRAINT "recurrence_shares_basis_points_range" CHECK ("basis_points" BETWEEN 1 AND 10000);

-- Row Level Security (ADR 0028), added by hand: Prisma does not manage policies.
ALTER TABLE "recurrence_shares" ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON "recurrence_shares"
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);
