-- Role used by the API at runtime (ADR 0028). Unlike the owner, which runs the migrations, it is
-- not a superuser and has no BYPASSRLS, so the Row Level Security policies apply to it.
-- Roles belong to the whole server, not to one database: create it only if it is missing.
-- NOLOGIN and no password here: the migration is public. Each environment enables login with
-- its own password (ALTER ROLE financas_app LOGIN PASSWORD '...').
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'financas_app') THEN
    CREATE ROLE financas_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

-- Reads and writes data, nothing else: no DDL, no TRUNCATE.
GRANT USAGE ON SCHEMA public TO financas_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO financas_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO financas_app;

-- Tables created by the next migrations (always run by the owner) get the same privileges.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO financas_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO financas_app;

-- Prisma's migration history is the owner's business only. The table does not exist in the
-- shadow database where `prisma migrate dev` replays the migrations, hence the check.
DO $$
BEGIN
  IF to_regclass('_prisma_migrations') IS NOT NULL THEN
    REVOKE ALL ON TABLE _prisma_migrations FROM financas_app;
  END IF;
END
$$;
