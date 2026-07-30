\set ON_ERROR_STOP on
ALTER ROLE workspace_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
SELECT format('ALTER ROLE %I NOLOGIN', rolname)
FROM pg_roles
WHERE rolname IN ('workspace_runtime','workspace_migrator','workspace_backup','workspace_monitor')
ORDER BY rolname
\gexec
ALTER DATABASE workspace OWNER TO workspace_app;
SELECT format('REVOKE ALL ON DATABASE workspace FROM %I', rolname)
FROM pg_roles
WHERE rolname IN ('workspace_runtime','workspace_migrator','workspace_backup','workspace_monitor')
ORDER BY rolname
\gexec
GRANT CONNECT ON DATABASE workspace TO workspace_app;
\connect workspace
SELECT 'REASSIGN OWNED BY workspace_owner TO workspace_app'
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname='workspace_owner')
\gexec
GRANT USAGE,CREATE ON SCHEMA public TO workspace_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO workspace_app;
GRANT USAGE,SELECT,UPDATE ON ALL SEQUENCES IN SCHEMA public TO workspace_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO workspace_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public."_prisma_migrations" TO workspace_app;
