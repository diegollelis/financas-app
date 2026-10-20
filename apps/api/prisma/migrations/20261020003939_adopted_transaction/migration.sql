-- AlterTable
ALTER TABLE "installment_plans" ADD COLUMN     "adopted_amount_cents" INTEGER,
ADD COLUMN     "adopted_transaction_id" UUID;

-- AlterTable
ALTER TABLE "recurrences" ADD COLUMN     "adopted_transaction_id" UUID;


-- "Tornar recorrente" before this column (ADR 0038 note): the transaction it adopted is the one of
-- its first month that existed before it; a month the recurrence generated is always created after.
UPDATE "recurrences" AS r
SET "adopted_transaction_id" = o."transaction_id"
FROM "recurrence_occurrences" AS o
JOIN "transactions" AS t ON t."id" = o."transaction_id"
WHERE o."recurrence_id" = r."id"
  AND o."period" = r."start_period"
  AND t."created_at" < r."created_at";
