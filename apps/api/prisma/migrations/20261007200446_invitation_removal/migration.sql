-- AlterTable
ALTER TABLE "invitations" ADD COLUMN     "left_on_own" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "removed_at" TIMESTAMPTZ(3);

