-- The daybook_app role, and handing it the daybook schema.
--
-- Run once, after drizzle/0003_daybook.sql, as the database's admin role (the
-- one that created the schema). drizzle-kit does not generate roles, and a
-- password has no business in a migration file, so it arrives as a psql
-- variable:
--
--   psql "$ADMIN_URL" -v password="$DAYBOOK_APP_PASSWORD" -f packages/db/roles/daybook.sql
--
-- Safe to rerun: the role is created only when missing, and the rest restates
-- ownership and grants.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'daybook_app') THEN
    CREATE ROLE daybook_app LOGIN;
  END IF;
END $$;

ALTER ROLE daybook_app PASSWORD :'password';
ALTER ROLE daybook_app SET search_path = daybook;

-- A non-superuser admin can only give an object to a role it belongs to.
GRANT daybook_app TO CURRENT_USER;

ALTER SCHEMA daybook OWNER TO daybook_app;
ALTER TABLE daybook.items OWNER TO daybook_app;
ALTER TABLE daybook.days OWNER TO daybook_app;
ALTER TABLE daybook.captures OWNER TO daybook_app;

-- Owning the schema is the whole grant. Nobody else gets in by default.
REVOKE ALL ON SCHEMA daybook FROM PUBLIC;
