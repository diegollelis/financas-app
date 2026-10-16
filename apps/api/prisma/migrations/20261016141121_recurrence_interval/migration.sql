-- AlterTable
ALTER TABLE "recurrences" ADD COLUMN     "interval_months" SMALLINT NOT NULL DEFAULT 1;


-- Every month (1) or every year (12), ADR 0038 note.
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_interval_months" CHECK ("interval_months" IN (1, 12));
