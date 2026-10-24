-- CreateEnum
CREATE TYPE "ImportKind" AS ENUM ('TEMPLATE', 'CARD_STATEMENT', 'ACCOUNT_STATEMENT');

-- CreateEnum
CREATE TYPE "StatementBank" AS ENUM ('NUBANK');

-- AlterTable
ALTER TABLE "imports" ADD COLUMN     "bank" "StatementBank",
ADD COLUMN     "kind" "ImportKind" NOT NULL DEFAULT 'TEMPLATE';

-- An import before ADR 0060 with a statement due date was a Nubank card statement (ADR 0055);
-- the others were the template.
UPDATE "imports" SET "kind" = 'CARD_STATEMENT', "bank" = 'NUBANK'
WHERE "statement_due_date" IS NOT NULL;

-- The template has no bank; a statement always has one.
ALTER TABLE "imports" ADD CONSTRAINT "imports_bank_of_statement"
CHECK (("kind" = 'TEMPLATE') = ("bank" IS NULL));
