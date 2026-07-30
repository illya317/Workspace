\set ON_ERROR_STOP on

CREATE SCHEMA IF NOT EXISTS workspace_security AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA workspace_security FROM PUBLIC;

CREATE OR REPLACE FUNCTION workspace_security.log_ddl_command()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  item record;
BEGIN
  FOR item IN SELECT * FROM pg_event_trigger_ddl_commands() LOOP
    RAISE LOG 'workspace_ddl_audit=%', json_build_object(
      'event', TG_EVENT,
      'tag', TG_TAG,
      'sessionUser', session_user,
      'currentUser', current_user,
      'role', current_setting('role', true),
      'database', current_database(),
      'application', current_setting('application_name', true),
      'transactionId', pg_current_xact_id_if_assigned(),
      'objectType', item.object_type,
      'schema', item.schema_name,
      'identity', item.object_identity
    )::text;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION workspace_security.log_sql_drop()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  item record;
BEGIN
  FOR item IN SELECT * FROM pg_event_trigger_dropped_objects() LOOP
    RAISE LOG 'workspace_ddl_audit=%', json_build_object(
      'event', TG_EVENT,
      'tag', TG_TAG,
      'sessionUser', session_user,
      'currentUser', current_user,
      'role', current_setting('role', true),
      'database', current_database(),
      'application', current_setting('application_name', true),
      'transactionId', pg_current_xact_id_if_assigned(),
      'objectType', item.object_type,
      'schema', item.schema_name,
      'identity', item.object_identity,
      'original', item.original,
      'normal', item.normal
    )::text;
  END LOOP;
END;
$function$;

DROP EVENT TRIGGER IF EXISTS workspace_ddl_command_audit;
CREATE EVENT TRIGGER workspace_ddl_command_audit
  ON ddl_command_end
  EXECUTE FUNCTION workspace_security.log_ddl_command();

DROP EVENT TRIGGER IF EXISTS workspace_sql_drop_audit;
CREATE EVENT TRIGGER workspace_sql_drop_audit
  ON sql_drop
  EXECUTE FUNCTION workspace_security.log_sql_drop();

REVOKE ALL ON FUNCTION workspace_security.log_ddl_command() FROM PUBLIC;
REVOKE ALL ON FUNCTION workspace_security.log_sql_drop() FROM PUBLIC;
