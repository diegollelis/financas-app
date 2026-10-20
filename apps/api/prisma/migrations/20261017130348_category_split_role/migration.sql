-- CreateEnum
CREATE TYPE "split_role" AS ENUM ('REIMBURSEMENT', 'PASS_THROUGH');

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "split_role" "split_role";

-- CreateIndex
CREATE UNIQUE INDEX "categories_workspace_id_split_role_key" ON "categories"("workspace_id", "split_role");


-- Reembolso is a credit, Repasse a debit (ADR 0052 note).
ALTER TABLE "categories" ADD CONSTRAINT "categories_split_role_type" CHECK (
  "split_role" IS NULL
  OR ("split_role" = 'REIMBURSEMENT' AND "type" = 'CREDIT')
  OR ("split_role" = 'PASS_THROUGH' AND "type" = 'DEBIT')
);

-- The ones that exist, found by name as the app found them until now: the oldest of each
-- workspace, ignoring case. A workspace without one gets it marked or created on its next split.
UPDATE "categories" AS c SET "split_role" = 'REIMBURSEMENT'
FROM (
  SELECT DISTINCT ON ("workspace_id") "id" FROM "categories"
  WHERE "type" = 'CREDIT' AND lower("name") = 'reembolso'
  ORDER BY "workspace_id", "created_at", "id"
) AS first
WHERE c."id" = first."id";

UPDATE "categories" AS c SET "split_role" = 'PASS_THROUGH'
FROM (
  SELECT DISTINCT ON ("workspace_id") "id" FROM "categories"
  WHERE "type" = 'DEBIT' AND lower("name") = 'repasse'
  ORDER BY "workspace_id", "created_at", "id"
) AS first
WHERE c."id" = first."id";

-- They come back to the selectors: an archived one was reactivated on the next split anyway.
UPDATE "categories" SET "archived_at" = NULL WHERE "split_role" IS NOT NULL;
