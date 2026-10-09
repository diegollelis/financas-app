-- CreateEnum
CREATE TYPE "budget_destination_kind" AS ENUM ('EXPENSES', 'SAVINGS');

-- CreateTable
CREATE TABLE "budget_destinations" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "kind" "budget_destination_kind" NOT NULL,
    "position" INTEGER NOT NULL,
    "category_id" UUID,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "budget_destinations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "budget_destinations_workspace_id_name_key" ON "budget_destinations"("workspace_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "budget_destinations_category_id_workspace_id_key" ON "budget_destinations"("category_id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_id_workspace_id_key" ON "categories"("id", "workspace_id");

-- AddForeignKey
ALTER TABLE "budget_destinations" ADD CONSTRAINT "budget_destinations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_destinations" ADD CONSTRAINT "budget_destinations_category_id_workspace_id_fkey" FOREIGN KEY ("category_id", "workspace_id") REFERENCES "categories"("id", "workspace_id") ON DELETE NO ACTION ON UPDATE NO ACTION;



-- Rules the database enforces by itself, added by hand (ADR 0047): a destination has a name,
-- and only the saving ones (SAVINGS) have a category of their own.
ALTER TABLE "budget_destinations" ADD CONSTRAINT "budget_destinations_name_not_blank" CHECK (length(btrim("name")) > 0);
ALTER TABLE "budget_destinations" ADD CONSTRAINT "budget_destinations_category_by_kind" CHECK (("kind" = 'EXPENSES') = ("category_id" IS NULL));

-- Row Level Security (ADR 0028), added by hand: Prisma does not manage policies.
ALTER TABLE "budget_destinations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON "budget_destinations"
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

-- The default destinations, for the workspaces that already exist. New workspaces get them
-- from the API (src/budget-destinations/default-destinations.ts), with the same names.
-- First the debit categories of the saving ones; a workspace that already has a debit category
-- with that name keeps it, and it becomes the destination's.
INSERT INTO "categories" ("id", "workspace_id", "name", "type", "updated_at")
SELECT uuidv7(), w.id, d.name, 'DEBIT'::"transaction_type", CURRENT_TIMESTAMP
FROM "workspaces" w
CROSS JOIN (VALUES ('Investimentos'), ('Reserva de emergência'), ('Viagens')) AS d(name)
WHERE NOT EXISTS (
  SELECT 1 FROM "categories" c
  WHERE c.workspace_id = w.id AND c.type = 'DEBIT' AND c.name = d.name
);

INSERT INTO "budget_destinations" ("id", "workspace_id", "name", "kind", "position", "category_id", "updated_at")
SELECT uuidv7(), w.id, 'Despesas', 'EXPENSES'::"budget_destination_kind", 0, NULL, CURRENT_TIMESTAMP
FROM "workspaces" w;

INSERT INTO "budget_destinations" ("id", "workspace_id", "name", "kind", "position", "category_id", "updated_at")
SELECT uuidv7(), c.workspace_id, d.name, 'SAVINGS'::"budget_destination_kind", d.position, c.id, CURRENT_TIMESTAMP
FROM (VALUES ('Investimentos', 1), ('Reserva de emergência', 2), ('Viagens', 3)) AS d(name, position)
JOIN "categories" c ON c.type = 'DEBIT' AND c.name = d.name;
