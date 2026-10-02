-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "type" "transaction_type" NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "notes" VARCHAR(1000),
    "category_id" UUID NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "period" CHAR(7) NOT NULL,
    "due_date" DATE,
    "settled_at" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transactions_workspace_id_period_idx" ON "transactions"("workspace_id", "period");

-- CreateIndex
CREATE INDEX "transactions_category_id_idx" ON "transactions"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_id_workspace_id_type_key" ON "categories"("id", "workspace_id", "type");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_workspace_id_type_fkey" FOREIGN KEY ("category_id", "workspace_id", "type") REFERENCES "categories"("id", "workspace_id", "type") ON DELETE NO ACTION ON UPDATE NO ACTION;


-- Rules the database enforces by itself, added by hand (ADRs 0010 and 0029): the amount is always
-- positive (the sign comes from the type) and the competência is a real YYYY-MM.
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_amount_cents_positive" CHECK ("amount_cents" > 0);
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_period_format" CHECK ("period" ~ '^\d{4}-(0[1-9]|1[0-2])$');

-- Row Level Security (ADR 0028), added by hand: Prisma does not manage policies.
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON "transactions"
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);
