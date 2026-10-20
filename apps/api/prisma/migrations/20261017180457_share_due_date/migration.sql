-- The pending shares of a split fall due with the transaction they share (ADR 0052 note). Those
-- created before had no due date: they take their origin's. Settled ones are history.
UPDATE "transactions" AS share SET "due_date" = origin."due_date"
FROM "transactions" AS origin
WHERE share."split_of_id" = origin."id"
  AND share."settled_at" IS NULL
  AND share."due_date" IS NULL
  AND origin."due_date" IS NOT NULL;
