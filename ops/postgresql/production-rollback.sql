\set ON_ERROR_STOP on
ALTER ROLE workspace_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE workspace_runtime NOLOGIN;
ALTER ROLE workspace_migrator NOLOGIN;
ALTER ROLE workspace_backup NOLOGIN;
ALTER ROLE workspace_monitor NOLOGIN;
ALTER DATABASE workspace OWNER TO workspace_app;
REVOKE ALL ON DATABASE workspace FROM workspace_runtime,workspace_migrator,workspace_backup,workspace_monitor;
GRANT CONNECT ON DATABASE workspace TO workspace_app;
\connect workspace
REASSIGN OWNED BY workspace_owner TO workspace_app;
GRANT USAGE,CREATE ON SCHEMA public TO workspace_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO workspace_app;
GRANT USAGE,SELECT,UPDATE ON ALL SEQUENCES IN SCHEMA public TO workspace_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO workspace_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public."_prisma_migrations" TO workspace_app;
