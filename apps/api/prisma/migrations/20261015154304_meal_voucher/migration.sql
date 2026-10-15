-- AlterEnum
-- A meal or food voucher (ADR 0054 note), right after the credit card in the list.
ALTER TYPE "payment_method" ADD VALUE 'MEAL_VOUCHER' AFTER 'CREDIT_CARD';
