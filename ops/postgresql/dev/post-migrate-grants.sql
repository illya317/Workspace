DO $identity$
BEGIN
  IF current_user <> 'workspace_dev_owner' OR session_user <> 'workspace_dev_migrator' THEN
    RAISE EXCEPTION 'post-migrate grants require migrator session with owner role';
  END IF;
END
$identity$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO workspace_dev_runtime, workspace_dev_backup;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO workspace_dev_runtime;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO workspace_dev_runtime;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO workspace_dev_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO workspace_dev_backup;

DO $routine_grants$
DECLARE
  routine_record record;
BEGIN
  FOR routine_record IN
    SELECT
      namespace.nspname,
      routine.proname,
      pg_get_function_identity_arguments(routine.oid) AS identity_arguments
    FROM pg_proc routine
    JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'public'
      AND routine.proowner = 'workspace_dev_owner'::regrole
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend dependency
        WHERE dependency.classid = 'pg_proc'::regclass
          AND dependency.objid = routine.oid
          AND dependency.deptype = 'e'
      )
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON ROUTINE %I.%I(%s) FROM PUBLIC',
      routine_record.nspname,
      routine_record.proname,
      routine_record.identity_arguments
    );
    EXECUTE format(
      'GRANT EXECUTE ON ROUTINE %I.%I(%s) TO workspace_dev_runtime',
      routine_record.nspname,
      routine_record.proname,
      routine_record.identity_arguments
    );
  END LOOP;
END
$routine_grants$;

REVOKE ALL ON TABLE public."_prisma_migrations" FROM workspace_dev_runtime;
GRANT SELECT ON TABLE public."_prisma_migrations" TO workspace_dev_backup;
