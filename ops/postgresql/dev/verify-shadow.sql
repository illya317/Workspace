\set ON_ERROR_STOP on

SELECT 'shadow_owner_identity', current_user = 'workspace_dev_owner'
UNION ALL
SELECT 'shadow_migrator_session', session_user = 'workspace_dev_migrator'
UNION ALL
SELECT 'shadow_database_owner', COALESCE((
  SELECT datdba = current_user::regrole
  FROM pg_database
  WHERE datname = current_database()
), false)
UNION ALL
SELECT 'shadow_public_schema_owner', COALESCE((
  SELECT nspowner = current_user::regrole
  FROM pg_namespace
  WHERE nspname = 'public'
), false)
UNION ALL
SELECT 'shadow_public_schema_create', has_schema_privilege(current_user, 'public', 'CREATE')
UNION ALL
SELECT 'shadow_no_legacy_public_relation_ownership', NOT EXISTS (
  SELECT 1
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relowner = 'workspace_dev'::regrole
    AND NOT EXISTS (
      SELECT 1 FROM pg_depend d
      WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e'
    )
)
UNION ALL
SELECT 'shadow_no_legacy_public_routine_ownership', NOT EXISTS (
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
SELECT 'shadow_no_legacy_public_type_ownership', NOT EXISTS (
  SELECT 1
  FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public'
    AND t.typowner = 'workspace_dev'::regrole
    AND NOT EXISTS (
      SELECT 1 FROM pg_depend d
      WHERE d.classid = 'pg_type'::regclass AND d.objid = t.oid AND d.deptype = 'e'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_type extension_base_type
      JOIN pg_depend extension_dependency
        ON extension_dependency.classid = 'pg_type'::regclass
       AND extension_dependency.objid = extension_base_type.oid
       AND extension_dependency.deptype = 'e'
      WHERE extension_base_type.typarray = t.oid
    )
);
