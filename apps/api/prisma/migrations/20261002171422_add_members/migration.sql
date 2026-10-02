-- CreateEnum
CREATE TYPE "workspace_role" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "is_personal" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "members" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "workspace_role" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "members_user_id_idx" ON "members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "members_workspace_id_user_id_key" ON "members"("workspace_id", "user_id");

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data migration (ADR 0024): every existing user gets a personal workspace, as new users do on
-- sign-up. uuidv7() is native from PostgreSQL 18 on, the version used locally and in production.
DO $$
DECLARE
  account RECORD;
  personal_id UUID;
BEGIN
  FOR account IN SELECT id FROM users LOOP
    personal_id := uuidv7();
    INSERT INTO workspaces (id, name, is_personal, created_at, updated_at)
    VALUES (personal_id, 'Pessoal', true, now(), now());
    INSERT INTO members (id, workspace_id, user_id, role, created_at, updated_at)
    VALUES (uuidv7(), personal_id, account.id, 'OWNER', now(), now());
  END LOOP;
END $$;
