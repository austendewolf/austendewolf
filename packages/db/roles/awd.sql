-- The site's own role, owning the two schemas apps/web writes to.
--
-- `awd_app` predates the split and used to sit on `public` with its search_path
-- pointing there. The tables moved on 09/21/2026, so the path names both.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'awd_app') THEN CREATE ROLE awd_app LOGIN; END IF;
END $$;

ALTER ROLE awd_app PASSWORD :'password';
ALTER ROLE awd_app SET search_path = gateway, site;

GRANT awd_app TO CURRENT_USER;

ALTER SCHEMA gateway OWNER TO awd_app;
ALTER SCHEMA site OWNER TO awd_app;
ALTER TABLE gateway.accounts OWNER TO awd_app;
ALTER TABLE gateway.upstreams OWNER TO awd_app;
ALTER TABLE site.messages OWNER TO awd_app;

REVOKE ALL ON SCHEMA gateway FROM PUBLIC;
REVOKE ALL ON SCHEMA site FROM PUBLIC;
