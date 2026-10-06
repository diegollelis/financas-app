-- AlterTable
ALTER TABLE "recurrences" ADD COLUMN     "variable_amount" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "amount_estimated" BOOLEAN NOT NULL DEFAULT false;
