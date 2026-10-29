-- ADR 0064: every share of a budget is of the net income now, the goals included. A goal was a
-- share of what was left after the spending limit; the same plan, for a month that goes as
-- planned, is that share times (100% - limit): 50% of the leftover with a 60% limit is 20% of the
-- income. The integer division drops the rounding into "Sem meta"; with no limit, a goal stays.
--
-- It is a change of the rule, not an edit of a month (ADR 0064): closed months (ADR 0063) are
-- converted too, so the period lock trigger is off for this statement only.
ALTER TABLE "budget_shares" DISABLE TRIGGER budget_shares_period_lock;

UPDATE "budget_shares" AS goal
SET "basis_points" = goal."basis_points" * (10000 - COALESCE(
      (
        SELECT expenses."basis_points"
        FROM "budget_shares" AS expenses
        JOIN "budget_destinations" AS destination ON destination."id" = expenses."destination_id"
        WHERE expenses."budget_config_id" = goal."budget_config_id"
          AND destination."kind" = 'EXPENSES'
      ),
      0
    )) / 10000,
    "updated_at" = now()
FROM "budget_destinations" AS kind
WHERE kind."id" = goal."destination_id"
  AND kind."kind" = 'SAVINGS';

ALTER TABLE "budget_shares" ENABLE TRIGGER budget_shares_period_lock;
