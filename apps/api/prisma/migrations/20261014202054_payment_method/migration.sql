-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('PIX', 'DEBIT_CARD', 'CREDIT_CARD', 'CASH', 'BOLETO', 'TRANSFER', 'AUTO_DEBIT');

-- AlterTable
ALTER TABLE "installment_plans" ADD COLUMN     "payment_method" "payment_method";

-- AlterTable
ALTER TABLE "recurrences" ADD COLUMN     "payment_method" "payment_method";

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "payment_method" "payment_method";

