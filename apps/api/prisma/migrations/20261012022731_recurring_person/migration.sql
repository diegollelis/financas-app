-- AlterTable
ALTER TABLE "installment_plans" ADD COLUMN     "person_id" UUID;

-- AlterTable
ALTER TABLE "recurrences" ADD COLUMN     "person_id" UUID;

-- AddForeignKey
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_person_id_workspace_id_fkey" FOREIGN KEY ("person_id", "workspace_id") REFERENCES "people"("id", "workspace_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_person_id_workspace_id_fkey" FOREIGN KEY ("person_id", "workspace_id") REFERENCES "people"("id", "workspace_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

