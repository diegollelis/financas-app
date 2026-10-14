-- AlterTable
ALTER TABLE "installment_plans" ADD COLUMN     "due_month_offset" SMALLINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "recurrences" ADD COLUMN     "due_month_offset" SMALLINT NOT NULL DEFAULT 0;


-- Due in the same month (0) or in the next one (1), ADR 0038 note.
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_due_month_offset" CHECK ("due_month_offset" BETWEEN 0 AND 1);
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_due_month_offset" CHECK ("due_month_offset" BETWEEN 0 AND 1);
