-- The installments of a plan brought by a card statement import (ADR 0055) were created without
-- the plan's merchant. Every installment carries it (ADR 0053): copy it to those still without one.
UPDATE "transactions" AS t
SET "merchant_id" = p."merchant_id"
FROM "installment_plans" AS p
WHERE t."installment_plan_id" = p."id"
  AND p."import_id" IS NOT NULL
  AND p."merchant_id" IS NOT NULL
  AND t."merchant_id" IS NULL
  AND t."split_of_id" IS NULL;
