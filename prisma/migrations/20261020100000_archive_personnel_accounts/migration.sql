-- Preserve report ownership and audit references when a registration is removed.
ALTER TABLE "personnel" ADD COLUMN "deletedAt" TIMESTAMPTZ(3);
ALTER TABLE "users" ADD COLUMN "deletedAt" TIMESTAMPTZ(3);
