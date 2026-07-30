\set ON_ERROR_STOP on
\connect postgres

SELECT 'CREATE ROLE workspace_dev_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workspace_dev_owner') \gexec
SELECT 'CREATE ROLE workspace_dev_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 20'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workspace_dev_runtime') \gexec
SELECT 'CREATE ROLE workspace_dev_migrator LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 3'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workspace_dev_migrator') \gexec
SELECT 'CREATE ROLE workspace_dev_backup LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 2'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workspace_dev_backup') \gexec
SELECT 'CREATE ROLE workspace_dev_monitor LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 2'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workspace_dev_monitor') \gexec

ALTER ROLE workspace_dev_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE workspace_dev_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 20;
ALTER ROLE workspace_dev_migrator LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 3;
ALTER ROLE workspace_dev_backup LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 2;
ALTER ROLE workspace_dev_monitor LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 2;

DO $security$
DECLARE
  role_name text;
  secret_path text;
  secret_value text;
BEGIN
  FOR role_name, secret_path IN VALUES
    ('workspace_dev', '/run/secrets/postgres_admin_password'),
    ('workspace_dev_runtime', '/run/secrets/workspace_dev_runtime_password'),
    ('workspace_dev_migrator', '/run/secrets/workspace_dev_migrator_password'),
    ('workspace_dev_backup', '/run/secrets/workspace_dev_backup_password'),
    ('workspace_dev_monitor', '/run/secrets/workspace_dev_monitor_password')
  LOOP
    secret_value := regexp_replace(pg_read_file(secret_path), E'[\\r\\n]+$', '');
    IF length(secret_value) < 32 THEN
      RAISE EXCEPTION 'password secret for % is missing or too short', role_name;
    END IF;
    EXECUTE format('ALTER ROLE %I PASSWORD %L', role_name, secret_value);
  END LOOP;
END
$security$;

GRANT workspace_dev_owner TO workspace_dev_migrator;
GRANT pg_monitor TO workspace_dev_monitor;

SELECT 'CREATE DATABASE workspace_dev_shadow OWNER workspace_dev_owner'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'workspace_dev_shadow') \gexec
ALTER DATABASE workspace_dev OWNER TO workspace_dev_owner;
ALTER DATABASE workspace_dev_shadow OWNER TO workspace_dev_owner;

REVOKE CONNECT, TEMPORARY ON DATABASE workspace_dev FROM PUBLIC;
REVOKE CONNECT, TEMPORARY ON DATABASE workspace_dev_shadow FROM PUBLIC;
GRANT CONNECT ON DATABASE workspace_dev TO workspace_dev_runtime, workspace_dev_migrator, workspace_dev_backup, workspace_dev_monitor;
GRANT CONNECT ON DATABASE workspace_dev_shadow TO workspace_dev_migrator;

ALTER ROLE workspace_dev_runtime IN DATABASE workspace_dev SET statement_timeout = '120s';
ALTER ROLE workspace_dev_runtime IN DATABASE workspace_dev SET lock_timeout = '10s';
ALTER ROLE workspace_dev_runtime IN DATABASE workspace_dev SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE workspace_dev_migrator IN DATABASE workspace_dev SET statement_timeout = '0';
ALTER ROLE workspace_dev_migrator IN DATABASE workspace_dev SET lock_timeout = '10s';
ALTER ROLE workspace_dev_migrator IN DATABASE workspace_dev_shadow SET statement_timeout = '0';
ALTER ROLE workspace_dev_migrator IN DATABASE workspace_dev_shadow SET lock_timeout = '10s';
ALTER ROLE workspace_dev_backup IN DATABASE workspace_dev SET default_transaction_read_only = on;
ALTER ROLE workspace_dev_backup IN DATABASE workspace_dev SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE workspace_dev_monitor IN DATABASE workspace_dev SET default_transaction_read_only = on;

\connect workspace_dev
CREATE EXTENSION IF NOT EXISTS btree_gist;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

DO $schema_owner$
BEGIN
  IF (SELECT nspowner = 'workspace_dev'::regrole FROM pg_namespace WHERE nspname = 'public') THEN
    ALTER SCHEMA public OWNER TO workspace_dev_owner;
  END IF;
END
$schema_owner$;

DO $ownership$
DECLARE
  object_record record;
  object_kind text;
BEGIN
  FOR object_record IN
    SELECT n.nspname, c.relname, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relowner = 'workspace_dev'::regrole
      AND c.relkind IN ('r', 'p', 'S', 'v', 'm', 'f')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend d
        WHERE d.classid = 'pg_class'::regclass
          AND d.objid = c.oid
          AND d.deptype = 'e'
      )
  LOOP
    object_kind := CASE object_record.relkind
      WHEN 'S' THEN 'SEQUENCE'
      WHEN 'v' THEN 'VIEW'
      WHEN 'm' THEN 'MATERIALIZED VIEW'
      WHEN 'f' THEN 'FOREIGN TABLE'
      ELSE 'TABLE'
    END;
    EXECUTE format(
      'ALTER %s %I.%I OWNER TO workspace_dev_owner',
      object_kind,
      object_record.nspname,
      object_record.relname
    );
  END LOOP;

  FOR object_record IN
    SELECT
      n.nspname,
      p.proname,
      pg_get_function_identity_arguments(p.oid) AS identity_arguments
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proowner = 'workspace_dev'::regrole
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend d
        WHERE d.classid = 'pg_proc'::regclass
          AND d.objid = p.oid
          AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format(
      'ALTER ROUTINE %I.%I(%s) OWNER TO workspace_dev_owner',
      object_record.nspname,
      object_record.proname,
      object_record.identity_arguments
    );
  END LOOP;

  FOR object_record IN
    SELECT n.nspname, t.typname
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typowner = 'workspace_dev'::regrole
      AND t.typtype IN ('b', 'c', 'd', 'e', 'r', 'm')
      AND NOT EXISTS (SELECT 1 FROM pg_type base_type WHERE base_type.typarray = t.oid)
      AND (
        t.typrelid = 0
        OR EXISTS (
          SELECT 1 FROM pg_class type_relation
          WHERE type_relation.oid = t.typrelid AND type_relation.relkind = 'c'
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_type'::regclass AND d.objid = t.oid AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format('ALTER TYPE %I.%I OWNER TO workspace_dev_owner', object_record.nspname, object_record.typname);
  END LOOP;
END
$ownership$;

CREATE SCHEMA IF NOT EXISTS workspace_security AUTHORIZATION workspace_dev_owner;
ALTER SCHEMA workspace_security OWNER TO workspace_dev_owner;
REVOKE ALL ON SCHEMA workspace_security FROM PUBLIC;

CREATE OR REPLACE FUNCTION workspace_security.log_ddl_metadata()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $ddl_audit$
DECLARE
  ddl_record record;
BEGIN
  FOR ddl_record IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    RAISE LOG 'workspace_ddl_audit action=ddl user=% tag=% object_type=% schema=% identity=%',
      session_user,
      regexp_replace(COALESCE(ddl_record.command_tag, ''), E'[\\n\\r\\t]+', ' ', 'g'),
      regexp_replace(COALESCE(ddl_record.object_type, ''), E'[\\n\\r\\t]+', ' ', 'g'),
      regexp_replace(COALESCE(ddl_record.schema_name, ''), E'[\\n\\r\\t]+', ' ', 'g'),
      regexp_replace(COALESCE(ddl_record.object_identity, ''), E'[\\n\\r\\t]+', ' ', 'g');
  END LOOP;
END
$ddl_audit$;
ALTER FUNCTION workspace_security.log_ddl_metadata() OWNER TO workspace_dev_owner;
REVOKE ALL ON FUNCTION workspace_security.log_ddl_metadata() FROM PUBLIC;

CREATE OR REPLACE FUNCTION workspace_security.log_drop_metadata()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $drop_audit$
DECLARE
  dropped_record record;
BEGIN
  FOR dropped_record IN SELECT * FROM pg_event_trigger_dropped_objects()
  LOOP
    RAISE LOG 'workspace_ddl_audit action=drop user=% object_type=% schema=% identity=%',
      session_user,
      regexp_replace(COALESCE(dropped_record.object_type, ''), E'[\\n\\r\\t]+', ' ', 'g'),
      regexp_replace(COALESCE(dropped_record.schema_name, ''), E'[\\n\\r\\t]+', ' ', 'g'),
      regexp_replace(COALESCE(dropped_record.object_identity, ''), E'[\\n\\r\\t]+', ' ', 'g');
  END LOOP;
END
$drop_audit$;
ALTER FUNCTION workspace_security.log_drop_metadata() OWNER TO workspace_dev_owner;
REVOKE ALL ON FUNCTION workspace_security.log_drop_metadata() FROM PUBLIC;

DROP EVENT TRIGGER IF EXISTS workspace_ddl_metadata_audit;
CREATE EVENT TRIGGER workspace_ddl_metadata_audit
  ON ddl_command_end
  EXECUTE FUNCTION workspace_security.log_ddl_metadata();
DROP EVENT TRIGGER IF EXISTS workspace_drop_metadata_audit;
CREATE EVENT TRIGGER workspace_drop_metadata_audit
  ON sql_drop
  EXECUTE FUNCTION workspace_security.log_drop_metadata();

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO workspace_dev_runtime, workspace_dev_backup;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO workspace_dev_runtime;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO workspace_dev_runtime;
GRANT EXECUTE ON ALL ROUTINES IN SCHEMA public TO workspace_dev_runtime;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO workspace_dev_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO workspace_dev_backup;

ALTER DEFAULT PRIVILEGES FOR ROLE workspace_dev_owner IN SCHEMA public REVOKE EXECUTE ON ROUTINES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE workspace_dev_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO workspace_dev_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE workspace_dev_owner IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO workspace_dev_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE workspace_dev_owner IN SCHEMA public GRANT EXECUTE ON ROUTINES TO workspace_dev_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE workspace_dev_owner IN SCHEMA public GRANT SELECT ON TABLES TO workspace_dev_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE workspace_dev_owner IN SCHEMA public GRANT SELECT ON SEQUENCES TO workspace_dev_backup;

DO $migration_ledger$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    REVOKE ALL ON TABLE public."_prisma_migrations" FROM workspace_dev_runtime;
    GRANT SELECT ON TABLE public."_prisma_migrations" TO workspace_dev_backup;
  END IF;
END
$migration_ledger$;
