-- Move the site's own tables out of `public`.
--
-- `workout` and `daybook` each had a schema; the gateway's tables and the
-- contact form sat in `public`, the schema every role falls back to. This
-- gives them named homes and leaves `public` empty.
--
-- Written as a move rather than a create/drop so the rows survive.

CREATE SCHEMA IF NOT EXISTS gateway;
CREATE SCHEMA IF NOT EXISTS site;

ALTER TABLE public.mcp_accounts SET SCHEMA gateway;
ALTER TABLE gateway.mcp_accounts RENAME TO accounts;

ALTER TABLE public.mcp_upstreams SET SCHEMA gateway;
ALTER TABLE gateway.mcp_upstreams RENAME TO upstreams;

ALTER TABLE public.messages SET SCHEMA site;

ALTER SCHEMA gateway OWNER TO awd_app;
ALTER SCHEMA site OWNER TO awd_app;
ALTER TABLE gateway.accounts OWNER TO awd_app;
ALTER TABLE gateway.upstreams OWNER TO awd_app;
ALTER TABLE site.messages OWNER TO awd_app;

REVOKE ALL ON SCHEMA gateway FROM PUBLIC;
REVOKE ALL ON SCHEMA site FROM PUBLIC;

ALTER ROLE awd_app SET search_path = gateway, site;
