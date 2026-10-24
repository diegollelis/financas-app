-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "return_category_id" UUID;

-- CreateIndex
CREATE INDEX "categories_return_category_id_idx" ON "categories"("return_category_id");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_return_category_id_workspace_id_fkey" FOREIGN KEY ("return_category_id", "workspace_id") REFERENCES "categories"("id", "workspace_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
