\set ON_ERROR_STOP on
\getenv runtime_password WORKSPACE_RUNTIME_DATABASE_PASSWORD
\getenv migrator_password WORKSPACE_MIGRATOR_DATABASE_PASSWORD
\getenv backup_password WORKSPACE_BACKUP_DATABASE_PASSWORD
\getenv monitor_password WORKSPACE_MONITOR_DATABASE_PASSWORD
SET password_encryption='scram-sha-256';
DO $roles$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='workspace_owner') THEN CREATE ROLE workspace_owner NOLOGIN; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='workspace_runtime') THEN CREATE ROLE workspace_runtime LOGIN; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='workspace_migrator') THEN CREATE ROLE workspace_migrator LOGIN NOINHERIT; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='workspace_backup') THEN CREATE ROLE workspace_backup LOGIN; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='workspace_monitor') THEN CREATE ROLE workspace_monitor LOGIN; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='workspace_rollback_owner') THEN CREATE ROLE workspace_rollback_owner NOLOGIN; END IF;
END $roles$;
ALTER ROLE workspace_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE workspace_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 70 PASSWORD :'runtime_password';
ALTER ROLE workspace_migrator LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 8 PASSWORD :'migrator_password';
ALTER ROLE workspace_backup LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 3 PASSWORD :'backup_password';
ALTER ROLE workspace_monitor LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 5 PASSWORD :'monitor_password';
ALTER ROLE workspace_rollback_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT workspace_owner TO workspace_migrator WITH INHERIT FALSE, SET TRUE;
ALTER DATABASE workspace OWNER TO workspace_owner;
REVOKE ALL ON DATABASE workspace FROM PUBLIC;
REVOKE ALL ON DATABASE workspace FROM workspace_app;
REVOKE ALL ON DATABASE workspace FROM workspace_runtime,workspace_migrator,workspace_backup,workspace_monitor;
GRANT CONNECT ON DATABASE workspace TO workspace_runtime,workspace_migrator,workspace_backup,workspace_monitor;
REVOKE ALL ON DATABASE natsu FROM PUBLIC;
REVOKE ALL ON DATABASE natsu FROM workspace_app,workspace_runtime,workspace_migrator,workspace_backup,workspace_monitor;
GRANT CONNECT ON DATABASE natsu TO natsu_app;
REVOKE ALL ON DATABASE postgres FROM PUBLIC;
REVOKE ALL ON DATABASE postgres FROM workspace_app,workspace_runtime,workspace_migrator,workspace_backup,workspace_monitor;
\connect workspace
REASSIGN OWNED BY workspace_app TO workspace_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM workspace_app;
GRANT USAGE ON SCHEMA public TO workspace_runtime,workspace_backup,workspace_monitor;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM workspace_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM workspace_app;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM workspace_app;
SELECT format('REVOKE USAGE ON TYPE %I.%I FROM workspace_app',n.nspname,t.typname)
FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
JOIN LATERAL aclexplode(t.typacl) a ON true
WHERE n.nspname='public' AND a.grantee=(SELECT oid FROM pg_roles WHERE rolname='workspace_app')
\gexec
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO workspace_runtime;
REVOKE ALL ON TABLE public."_prisma_migrations" FROM workspace_runtime;
GRANT USAGE,SELECT,UPDATE ON ALL SEQUENCES IN SCHEMA public TO workspace_runtime;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO workspace_runtime;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO workspace_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO workspace_backup;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM workspace_monitor;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM workspace_monitor;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM workspace_monitor;
GRANT SELECT ON TABLE public."Department",public."Position",public."EmployeePosition",public."Employee",public."Employment",public."LoginAttempt" TO workspace_monitor;
ALTER DEFAULT PRIVILEGES FOR ROLE workspace_owner IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE workspace_owner IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO workspace_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE workspace_owner IN SCHEMA public GRANT USAGE,SELECT,UPDATE ON SEQUENCES TO workspace_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE workspace_owner IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO workspace_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE workspace_owner IN SCHEMA public GRANT SELECT ON TABLES TO workspace_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE workspace_owner IN SCHEMA public REVOKE ALL ON TABLES FROM workspace_monitor;
ALTER DEFAULT PRIVILEGES FOR ROLE workspace_owner IN SCHEMA public REVOKE ALL ON SEQUENCES FROM workspace_monitor;
ALTER DEFAULT PRIVILEGES FOR ROLE workspace_owner IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM workspace_monitor;
ALTER DEFAULT PRIVILEGES FOR ROLE workspace_owner IN SCHEMA public GRANT SELECT ON SEQUENCES TO workspace_backup;
ALTER ROLE workspace_runtime IN DATABASE workspace SET statement_timeout='15min';
ALTER ROLE workspace_runtime IN DATABASE workspace SET lock_timeout='15s';
ALTER ROLE workspace_runtime IN DATABASE workspace SET idle_in_transaction_session_timeout='60s';
ALTER ROLE workspace_backup IN DATABASE workspace SET default_transaction_read_only=on;
ALTER ROLE workspace_monitor IN DATABASE workspace SET default_transaction_read_only=on;
