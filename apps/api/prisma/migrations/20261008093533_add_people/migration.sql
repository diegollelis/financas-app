-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "person_id" UUID,
ADD COLUMN     "split_of_id" UUID;

-- CreateTable
CREATE TABLE "people" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "member_user_id" UUID,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "people_workspace_id_name_key" ON "people"("workspace_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "people_id_workspace_id_key" ON "people"("id", "workspace_id");

-- CreateIndex
CREATE INDEX "transactions_person_id_idx" ON "transactions"("person_id");

-- CreateIndex
CREATE INDEX "transactions_split_of_id_idx" ON "transactions"("split_of_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_person_id_workspace_id_fkey" FOREIGN KEY ("person_id", "workspace_id") REFERENCES "people"("id", "workspace_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_split_of_id_fkey" FOREIGN KEY ("split_of_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_member_user_id_fkey" FOREIGN KEY ("member_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Rules the database enforces by itself, added by hand (ADR 0042): a person has a name.
ALTER TABLE "people" ADD CONSTRAINT "people_name_not_blank" CHECK (length(btrim("name")) > 0);

-- Row Level Security (ADR 0028), added by hand: Prisma does not manage policies.
ALTER TABLE "people" ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON "people"
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

-- The credit category of the shares split from a debit (ADR 0042), for the workspaces that
-- already exist. New workspaces get it from the API (src/categories/default-categories.ts).
INSERT INTO "categories" ("id", "workspace_id", "name", "type", "updated_at")
SELECT uuidv7(), w.id, 'Reembolso', 'CREDIT'::"transaction_type", CURRENT_TIMESTAMP
FROM "workspaces" w
WHERE NOT EXISTS (
  SELECT 1 FROM "categories" c
  WHERE c.workspace_id = w.id AND c.type = 'CREDIT' AND c.name = 'Reembolso'
);
