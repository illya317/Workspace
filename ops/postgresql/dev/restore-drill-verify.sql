\set ON_ERROR_STOP on

SELECT 'restore_database_owner', COALESCE((
  SELECT datdba = 'workspace_dev_owner'::regrole
  FROM pg_database
  WHERE datname = current_database()
), false)
UNION ALL
SELECT 'restore_public_schema_owner', COALESCE((
  SELECT nspowner = 'workspace_dev_owner'::regrole
  FROM pg_namespace
  WHERE nspname = 'public'
), false)
UNION ALL
SELECT 'restore_has_relations', EXISTS (
  SELECT 1 FROM pg_class relation
  JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public' AND relation.relkind IN ('r', 'p')
)
UNION ALL
SELECT 'restore_constraints_validated', NOT EXISTS (
  SELECT 1 FROM pg_constraint WHERE NOT convalidated
)
UNION ALL
SELECT 'restore_has_migration_ledger', to_regclass('public._prisma_migrations') IS NOT NULL
UNION ALL
SELECT 'restore_runtime_no_migration_write', COALESCE(
  NOT has_table_privilege('workspace_dev_runtime', 'public._prisma_migrations', 'INSERT,UPDATE,DELETE'),
  false
)
UNION ALL
SELECT 'restore_runtime_no_schema_create', NOT has_schema_privilege('workspace_dev_runtime', 'public', 'CREATE')
UNION ALL
SELECT 'restore_no_legacy_relation_ownership', NOT EXISTS (
  SELECT 1
  FROM pg_class relation
  JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relowner = 'workspace_dev'::regrole
    AND NOT EXISTS (
      SELECT 1 FROM pg_depend dependency
      WHERE dependency.classid = 'pg_class'::regclass
        AND dependency.objid = relation.oid
        AND dependency.deptype = 'e'
    )
);
