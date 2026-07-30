\set ON_ERROR_STOP on

DROP EVENT TRIGGER IF EXISTS workspace_sql_drop_audit;
DROP EVENT TRIGGER IF EXISTS workspace_ddl_command_audit;
DROP SCHEMA IF EXISTS workspace_security CASCADE;
