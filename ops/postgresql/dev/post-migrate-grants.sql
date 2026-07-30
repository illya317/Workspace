\set ON_ERROR_STOP on

DO $identity$
BEGIN
  IF current_user <> 'workspace_dev_owner' OR session_user <> 'workspace_dev_migrator' THEN
    RAISE EXCEPTION 'post-migrate grants require migrator session with owner role';
  END IF;
END
$identity$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO workspace_dev_runtime, workspace_dev_backup;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO workspace_dev_runtime;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO workspace_dev_runtime;
GRANT EXECUTE ON ALL ROUTINES IN SCHEMA public TO workspace_dev_runtime;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO workspace_dev_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO workspace_dev_backup;
REVOKE ALL ON TABLE public."_prisma_migrations" FROM workspace_dev_runtime;
GRANT SELECT ON TABLE public."_prisma_migrations" TO workspace_dev_backup;
