\set ON_ERROR_STOP on

SELECT 'runtime_identity', current_user = 'workspace_dev_runtime'
UNION ALL
SELECT 'tls_active', COALESCE((SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()), false)
UNION ALL
SELECT 'tls_version', COALESCE((SELECT version IN ('TLSv1.2', 'TLSv1.3') FROM pg_stat_ssl WHERE pid = pg_backend_pid()), false)
UNION ALL
SELECT 'runtime_not_superuser', NOT rolsuper FROM pg_roles WHERE rolname = current_user
UNION ALL
SELECT 'runtime_cannot_create_role', NOT rolcreaterole FROM pg_roles WHERE rolname = current_user
UNION ALL
SELECT 'runtime_cannot_create_database', NOT rolcreatedb FROM pg_roles WHERE rolname = current_user
UNION ALL
SELECT 'runtime_cannot_bypass_rls', NOT rolbypassrls FROM pg_roles WHERE rolname = current_user
UNION ALL
SELECT 'runtime_no_schema_create', NOT has_schema_privilege(current_user, 'public', 'CREATE')
UNION ALL
SELECT 'runtime_no_database_temp', NOT has_database_privilege(current_user, current_database(), 'TEMP')
UNION ALL
SELECT 'runtime_no_migration_ledger_write', COALESCE(
  NOT has_table_privilege(current_user, 'public._prisma_migrations', 'INSERT,UPDATE,DELETE'),
  false
)
UNION ALL
SELECT 'runtime_statement_timeout', current_setting('statement_timeout') = '2min'
UNION ALL
SELECT 'runtime_lock_timeout', current_setting('lock_timeout') = '10s'
UNION ALL
SELECT 'runtime_idle_transaction_timeout', current_setting('idle_in_transaction_session_timeout') = '1min'
UNION ALL
SELECT 'legacy_no_public_relation_ownership', NOT EXISTS (
  SELECT 1
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relowner = 'workspace_dev'::regrole
    AND c.relkind IN ('r', 'p', 'S', 'v', 'm', 'f')
    AND NOT EXISTS (
      SELECT 1 FROM pg_depend d
      WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e'
    )
)
UNION ALL
SELECT 'legacy_no_public_routine_ownership', NOT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proowner = 'workspace_dev'::regrole
    AND NOT EXISTS (
      SELECT 1 FROM pg_depend d
      WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'
    )
)
UNION ALL
SELECT 'legacy_no_public_type_ownership', NOT EXISTS (
  SELECT 1
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
      SELECT 1 FROM pg_depend d
      WHERE d.classid = 'pg_type'::regclass AND d.objid = t.oid AND d.deptype = 'e'
    )
)
UNION ALL
SELECT 'legacy_no_public_schema_ownership', NOT EXISTS (
  SELECT 1 FROM pg_namespace
  WHERE nspname = 'public' AND nspowner = 'workspace_dev'::regrole
);
