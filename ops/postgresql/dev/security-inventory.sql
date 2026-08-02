\set ON_ERROR_STOP on

SELECT inventory_line
FROM (
  SELECT format(
    'role|%s|login=%s|super=%s|createdb=%s|createrole=%s|replication=%s|bypassrls=%s|inherit=%s|connlimit=%s',
    rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolinherit, rolconnlimit
  ) AS inventory_line
  FROM pg_roles
  WHERE rolname IN (
    'workspace_dev',
    'workspace_dev_owner',
    'workspace_dev_runtime',
    'workspace_dev_migrator',
    'workspace_dev_backup',
    'workspace_dev_monitor'
  )

  UNION ALL

  SELECT format(
    'membership|member=%s|role=%s|admin=%s',
    member_role.rolname,
    granted_role.rolname,
    membership.admin_option
  )
  FROM pg_auth_members membership
  JOIN pg_roles member_role ON member_role.oid = membership.member
  JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
  WHERE member_role.rolname IN ('workspace_dev_migrator', 'workspace_dev_monitor')

  UNION ALL

  SELECT format(
    'database|%s|owner=%s',
    'current',
    pg_get_userbyid(database.datdba)
  )
  FROM pg_database database
  WHERE database.datname = current_database()

  UNION ALL

  SELECT format(
    'acl|database=%s|grantee=%s|grantor=%s|privilege=%s|grantable=%s',
    'current',
    CASE WHEN privilege.grantee = 0 THEN 'PUBLIC' ELSE privilege.grantee::regrole::text END,
    privilege.grantor::regrole,
    privilege.privilege_type,
    privilege.is_grantable
  )
  FROM pg_database database
  CROSS JOIN LATERAL aclexplode(COALESCE(database.datacl, acldefault('d', database.datdba))) privilege
  WHERE database.datname = current_database()

  UNION ALL

  SELECT format(
    'role_setting|role=%s|database=%s|setting=%s',
    role.rolname,
    'current',
    setting
  )
  FROM pg_db_role_setting role_setting
  JOIN pg_roles role ON role.oid = role_setting.setrole
  JOIN pg_database database ON database.oid = role_setting.setdatabase
  CROSS JOIN LATERAL unnest(role_setting.setconfig) AS setting
  WHERE role.rolname LIKE 'workspace_dev_%'
    AND database.datname = current_database()

  UNION ALL

  SELECT format(
    'schema|%s|owner=%s',
    namespace.nspname,
    pg_get_userbyid(namespace.nspowner)
  )
  FROM pg_namespace namespace
  WHERE namespace.nspname IN ('public', 'workspace_security')

  UNION ALL

  SELECT format(
    'acl|schema=%s|grantee=%s|grantor=%s|privilege=%s|grantable=%s',
    namespace.nspname,
    CASE WHEN privilege.grantee = 0 THEN 'PUBLIC' ELSE privilege.grantee::regrole::text END,
    privilege.grantor::regrole,
    privilege.privilege_type,
    privilege.is_grantable
  )
  FROM pg_namespace namespace
  CROSS JOIN LATERAL aclexplode(COALESCE(namespace.nspacl, acldefault('n', namespace.nspowner))) privilege
  WHERE namespace.nspname IN ('public', 'workspace_security')

  UNION ALL

  SELECT format(
    'relation|kind=%s|name=%s.%s|owner=%s',
    relation.relkind,
    namespace.nspname,
    relation.relname,
    pg_get_userbyid(relation.relowner)
  )
  FROM pg_class relation
  JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relkind IN ('r', 'p', 'S', 'v', 'm', 'f')
    AND NOT EXISTS (
      SELECT 1 FROM pg_depend dependency
      WHERE dependency.classid = 'pg_class'::regclass
        AND dependency.objid = relation.oid
        AND dependency.deptype = 'e'
    )

  UNION ALL

  SELECT format(
    'acl|relation=%s.%s|grantee=%s|grantor=%s|privilege=%s|grantable=%s',
    namespace.nspname,
    relation.relname,
    CASE WHEN privilege.grantee = 0 THEN 'PUBLIC' ELSE privilege.grantee::regrole::text END,
    privilege.grantor::regrole,
    privilege.privilege_type,
    privilege.is_grantable
  )
  FROM pg_class relation
  JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
  CROSS JOIN LATERAL aclexplode(
    COALESCE(relation.relacl, acldefault(CASE WHEN relation.relkind = 'S' THEN 'S'::"char" ELSE 'r'::"char" END, relation.relowner))
  ) privilege
  WHERE namespace.nspname = 'public'
    AND relation.relkind IN ('r', 'p', 'S', 'v', 'm', 'f')
    AND NOT EXISTS (
      SELECT 1 FROM pg_depend dependency
      WHERE dependency.classid = 'pg_class'::regclass
        AND dependency.objid = relation.oid
        AND dependency.deptype = 'e'
    )

  UNION ALL

  SELECT format(
    'routine|name=%s.%s(%s)|owner=%s',
    namespace.nspname,
    routine.proname,
    pg_get_function_identity_arguments(routine.oid),
    pg_get_userbyid(routine.proowner)
  )
  FROM pg_proc routine
  JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
  WHERE namespace.nspname IN ('public', 'workspace_security')
    AND NOT EXISTS (
      SELECT 1 FROM pg_depend dependency
      WHERE dependency.classid = 'pg_proc'::regclass
        AND dependency.objid = routine.oid
        AND dependency.deptype = 'e'
    )

  UNION ALL

  SELECT format(
    'acl|routine=%s.%s(%s)|grantee=%s|grantor=%s|privilege=%s|grantable=%s',
    namespace.nspname,
    routine.proname,
    pg_get_function_identity_arguments(routine.oid),
    CASE WHEN privilege.grantee = 0 THEN 'PUBLIC' ELSE privilege.grantee::regrole::text END,
    privilege.grantor::regrole,
    privilege.privilege_type,
    privilege.is_grantable
  )
  FROM pg_proc routine
  JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(routine.proacl, acldefault('f', routine.proowner))) privilege
  WHERE namespace.nspname IN ('public', 'workspace_security')
    AND NOT EXISTS (
      SELECT 1 FROM pg_depend dependency
      WHERE dependency.classid = 'pg_proc'::regclass
        AND dependency.objid = routine.oid
        AND dependency.deptype = 'e'
    )

  UNION ALL

  SELECT format(
    'type|name=%s.%s|kind=%s|owner=%s',
    namespace.nspname,
    type_object.typname,
    type_object.typtype,
    pg_get_userbyid(type_object.typowner)
  )
  FROM pg_type type_object
  JOIN pg_namespace namespace ON namespace.oid = type_object.typnamespace
  WHERE namespace.nspname = 'public'
    AND NOT EXISTS (
      SELECT 1 FROM pg_depend dependency
      WHERE dependency.classid = 'pg_type'::regclass
        AND dependency.objid = type_object.oid
        AND dependency.deptype = 'e'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_type extension_base_type
      JOIN pg_depend extension_dependency
        ON extension_dependency.classid = 'pg_type'::regclass
       AND extension_dependency.objid = extension_base_type.oid
       AND extension_dependency.deptype = 'e'
      WHERE extension_base_type.typarray = type_object.oid
    )

  UNION ALL

  SELECT format(
    'acl|type=%s.%s|grantee=%s|grantor=%s|privilege=%s|grantable=%s',
    namespace.nspname,
    type_object.typname,
    CASE WHEN privilege.grantee = 0 THEN 'PUBLIC' ELSE privilege.grantee::regrole::text END,
    privilege.grantor::regrole,
    privilege.privilege_type,
    privilege.is_grantable
  )
  FROM pg_type type_object
  JOIN pg_namespace namespace ON namespace.oid = type_object.typnamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(type_object.typacl, acldefault('T', type_object.typowner))) privilege
  WHERE namespace.nspname = 'public'
    AND NOT EXISTS (
      SELECT 1 FROM pg_depend dependency
      WHERE dependency.classid = 'pg_type'::regclass
        AND dependency.objid = type_object.oid
        AND dependency.deptype = 'e'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_type extension_base_type
      JOIN pg_depend extension_dependency
        ON extension_dependency.classid = 'pg_type'::regclass
       AND extension_dependency.objid = extension_base_type.oid
       AND extension_dependency.deptype = 'e'
      WHERE extension_base_type.typarray = type_object.oid
    )

  UNION ALL

  SELECT format(
    'default_acl|owner=%s|schema=%s|kind=%s',
    pg_get_userbyid(default_acl.defaclrole),
    COALESCE(namespace.nspname, ''),
    default_acl.defaclobjtype
  )
  FROM pg_default_acl default_acl
  LEFT JOIN pg_namespace namespace ON namespace.oid = default_acl.defaclnamespace
  WHERE pg_get_userbyid(default_acl.defaclrole) = 'workspace_dev_owner'

  UNION ALL

  SELECT format(
    'default_acl_privilege|owner=%s|schema=%s|kind=%s|grantee=%s|grantor=%s|privilege=%s|grantable=%s',
    pg_get_userbyid(default_acl.defaclrole),
    COALESCE(namespace.nspname, ''),
    default_acl.defaclobjtype,
    CASE WHEN privilege.grantee = 0 THEN 'PUBLIC' ELSE privilege.grantee::regrole::text END,
    privilege.grantor::regrole,
    privilege.privilege_type,
    privilege.is_grantable
  )
  FROM pg_default_acl default_acl
  LEFT JOIN pg_namespace namespace ON namespace.oid = default_acl.defaclnamespace
  CROSS JOIN LATERAL aclexplode(default_acl.defaclacl) privilege
  WHERE pg_get_userbyid(default_acl.defaclrole) = 'workspace_dev_owner'

  UNION ALL

  SELECT format(
    'event_trigger|name=%s|owner=%s|enabled=%s',
    event_trigger.evtname,
    pg_get_userbyid(event_trigger.evtowner),
    event_trigger.evtenabled
  )
  FROM pg_event_trigger event_trigger
  WHERE event_trigger.evtname LIKE 'workspace_%'
) inventory
ORDER BY inventory_line;
