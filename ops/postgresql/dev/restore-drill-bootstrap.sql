\set ON_ERROR_STOP on
\connect postgres

SELECT 'CREATE ROLE workspace_dev LOGIN SUPERUSER CREATEDB CREATEROLE REPLICATION BYPASSRLS CONNECTION LIMIT -1'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workspace_dev') \gexec
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

GRANT workspace_dev_owner TO workspace_dev_migrator;
GRANT pg_monitor TO workspace_dev_monitor;

SELECT 'CREATE DATABASE workspace_dev_restore OWNER workspace_dev_owner'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'workspace_dev_restore') \gexec
ALTER DATABASE workspace_dev_restore OWNER TO workspace_dev_owner;
REVOKE CONNECT, TEMPORARY ON DATABASE workspace_dev_restore FROM PUBLIC;
GRANT CONNECT ON DATABASE workspace_dev_restore TO workspace_dev_runtime, workspace_dev_migrator, workspace_dev_backup, workspace_dev_monitor;

ALTER ROLE workspace_dev_runtime IN DATABASE workspace_dev_restore SET statement_timeout = '120s';
ALTER ROLE workspace_dev_runtime IN DATABASE workspace_dev_restore SET lock_timeout = '10s';
ALTER ROLE workspace_dev_runtime IN DATABASE workspace_dev_restore SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE workspace_dev_migrator IN DATABASE workspace_dev_restore SET statement_timeout = '0';
ALTER ROLE workspace_dev_migrator IN DATABASE workspace_dev_restore SET lock_timeout = '10s';
ALTER ROLE workspace_dev_backup IN DATABASE workspace_dev_restore SET default_transaction_read_only = on;
ALTER ROLE workspace_dev_backup IN DATABASE workspace_dev_restore SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE workspace_dev_monitor IN DATABASE workspace_dev_restore SET default_transaction_read_only = on;

\connect workspace_dev_restore
ALTER SCHEMA public OWNER TO workspace_dev_owner;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
