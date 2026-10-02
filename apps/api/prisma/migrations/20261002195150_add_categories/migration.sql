-- CreateEnum
CREATE TYPE "transaction_type" AS ENUM ('CREDIT', 'DEBIT');

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "type" "transaction_type" NOT NULL,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_workspace_id_type_name_key" ON "categories"("workspace_id", "type", "name");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security (ADR 0028), added by hand: Prisma does not manage policies. The API role
-- only sees and writes rows of the workspace set in app.workspace_id; without it, nothing.
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON "categories"
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

-- Default categories for the workspaces that already exist. New workspaces get them from the API
-- (src/categories/default-categories.ts, the same list as docs/dominio/modelo.md).
INSERT INTO "categories" ("id", "workspace_id", "name", "type", "updated_at")
SELECT uuidv7(), w.id, d.name, d.type::"transaction_type", CURRENT_TIMESTAMP
FROM "workspaces" w
CROSS JOIN (VALUES
  ('Salário', 'CREDIT'), ('PLR', 'CREDIT'), ('13º salário', 'CREDIT'), ('Férias', 'CREDIT'),
  ('Benefício', 'CREDIT'), ('Cashback', 'CREDIT'), ('Freelance', 'CREDIT'), ('Vendas', 'CREDIT'),
  ('Empréstimo', 'CREDIT'), ('Consórcio', 'CREDIT'), ('Saque-aniversário FGTS', 'CREDIT'),
  ('Restituição IRPF', 'CREDIT'), ('Outros', 'CREDIT'),
  ('Cartão de crédito', 'DEBIT'), ('Energia', 'DEBIT'), ('Internet', 'DEBIT'), ('Celular', 'DEBIT'),
  ('Streaming', 'DEBIT'), ('Mercado', 'DEBIT'), ('Vale-alimentação', 'DEBIT'),
  ('Combustível', 'DEBIT'), ('Carro', 'DEBIT'), ('Seguro do carro', 'DEBIT'), ('IPVA', 'DEBIT'),
  ('Lote', 'DEBIT'), ('Consórcio', 'DEBIT'), ('Empréstimo', 'DEBIT'), ('Faculdade', 'DEBIT'),
  ('Pós-graduação', 'DEBIT'), ('Curso', 'DEBIT'), ('Inglês', 'DEBIT'), ('Concurso', 'DEBIT'),
  ('Saúde', 'DEBIT'), ('Farmácia', 'DEBIT'), ('Suplemento', 'DEBIT'), ('Roupas', 'DEBIT'),
  ('Lazer', 'DEBIT'), ('Viagem', 'DEBIT'), ('Outros', 'DEBIT')
) AS d (name, type);
