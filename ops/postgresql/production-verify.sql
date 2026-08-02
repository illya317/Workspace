\set ON_ERROR_STOP on
DO $verify_cluster$
DECLARE role_name text;
BEGIN
 FOREACH role_name IN ARRAY ARRAY['workspace_owner','workspace_runtime','workspace_migrator','workspace_backup','workspace_monitor','workspace_rollback_owner'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN RAISE EXCEPTION 'missing role %',role_name; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('workspace_owner','workspace_rollback_owner','workspace_app') AND rolcanlogin) THEN RAISE EXCEPTION 'owner/legacy roles must be NOLOGIN'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('workspace_runtime','workspace_migrator','workspace_backup','workspace_monitor') AND NOT rolcanlogin) THEN RAISE EXCEPTION 'service roles must be LOGIN'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('workspace_runtime','workspace_migrator','workspace_backup','workspace_monitor') AND(rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) THEN RAISE EXCEPTION 'elevated login role'; END IF;
 IF (SELECT rolinherit FROM pg_roles WHERE rolname='workspace_migrator') THEN RAISE EXCEPTION 'migrator must be NOINHERIT'; END IF;
 IF EXISTS(SELECT 1 FROM pg_authid WHERE rolname IN('workspace_runtime','workspace_migrator','workspace_backup','workspace_monitor') AND coalesce(rolpassword,'') NOT LIKE 'SCRAM-SHA-256$%') THEN RAISE EXCEPTION 'service role password is not SCRAM'; END IF;
 IF pg_get_userbyid((SELECT datdba FROM pg_database WHERE datname='workspace'))<>'workspace_owner' THEN RAISE EXCEPTION 'wrong workspace owner'; END IF;
 IF NOT has_database_privilege('workspace_runtime','workspace','CONNECT') OR NOT has_database_privilege('workspace_migrator','workspace','CONNECT') OR NOT has_database_privilege('workspace_backup','workspace','CONNECT') OR NOT has_database_privilege('workspace_monitor','workspace','CONNECT') THEN RAISE EXCEPTION 'workspace database CONNECT grant incomplete'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['workspace_runtime','workspace_migrator','workspace_backup','workspace_monitor']) AS login_role(name) WHERE has_database_privilege(login_role.name,'workspace','CREATE') OR has_database_privilege(login_role.name,'workspace','TEMP')) THEN RAISE EXCEPTION 'Workspace login role has CREATE/TEMP database privilege'; END IF;
 IF has_database_privilege('workspace_runtime','natsu','CONNECT') OR has_database_privilege('workspace_migrator','natsu','CONNECT') OR has_database_privilege('workspace_backup','natsu','CONNECT') OR has_database_privilege('workspace_monitor','natsu','CONNECT') OR has_database_privilege('workspace_runtime','postgres','CONNECT') OR has_database_privilege('workspace_migrator','postgres','CONNECT') OR has_database_privilege('workspace_backup','postgres','CONNECT') OR has_database_privilege('workspace_monitor','postgres','CONNECT') THEN RAISE EXCEPTION 'Workspace role has foreign database CONNECT'; END IF;
 IF has_database_privilege('workspace_app','workspace','CONNECT') THEN RAISE EXCEPTION 'legacy role retains database CONNECT'; END IF;
 IF pg_has_role('workspace_monitor','pg_monitor','MEMBER') OR pg_has_role('workspace_monitor','pg_read_all_data','MEMBER') THEN RAISE EXCEPTION 'monitor has cluster-wide membership'; END IF;
 IF EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles member ON member.oid=m.member JOIN pg_roles granted ON granted.oid=m.roleid WHERE member.rolname IN('workspace_runtime','workspace_backup','workspace_monitor')) THEN RAISE EXCEPTION 'runtime/backup/monitor role membership is forbidden'; END IF;
 IF NOT pg_has_role('workspace_migrator','workspace_owner','MEMBER') THEN RAISE EXCEPTION 'migrator cannot SET ROLE owner'; END IF;
 IF EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename='workspace_app') THEN RAISE EXCEPTION 'legacy database session remains'; END IF;
 IF EXISTS(
   SELECT 1 FROM pg_shdepend
   WHERE dbid=(SELECT oid FROM pg_database WHERE datname='workspace')
     AND refobjid=(SELECT oid FROM pg_roles WHERE rolname='workspace_app')
     AND deptype IN('o','a')
 ) THEN RAISE EXCEPTION 'legacy owner or ACL dependency remains in workspace database'; END IF;
 IF EXISTS(
   SELECT 1 FROM pg_database d JOIN pg_shdepend sd ON sd.dbid=d.oid JOIN pg_roles r ON r.oid=sd.refobjid
   WHERE d.datname~'^workspace_rollback_[a-zA-Z0-9_]+$' AND r.rolname='workspace_app' AND sd.deptype='o'
 ) THEN RAISE EXCEPTION 'legacy owner remains in rollback database'; END IF;
 IF EXISTS(SELECT 1 FROM pg_database WHERE datname~'^workspace_rollback_[a-zA-Z0-9_]+$' AND(datallowconn OR pg_get_userbyid(datdba)<>'workspace_rollback_owner')) THEN RAISE EXCEPTION 'rollback database is not sealed'; END IF;
END $verify_cluster$;

\connect workspace
DO $verify_workspace$
DECLARE legacy_oid oid := (SELECT oid FROM pg_roles WHERE rolname='workspace_app');
BEGIN
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relrowsecurity) OR EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public') THEN RAISE EXCEPTION 'RLS baseline changed; RLS is outside this cutover'; END IF;
 IF has_schema_privilege('workspace_runtime','public','CREATE') THEN RAISE EXCEPTION 'runtime may create'; END IF;
 IF has_table_privilege('workspace_runtime','public."_prisma_migrations"','SELECT') OR has_table_privilege('workspace_runtime','public."_prisma_migrations"','INSERT') OR has_table_privilege('workspace_runtime','public."_prisma_migrations"','UPDATE') OR has_table_privilege('workspace_runtime','public."_prisma_migrations"','DELETE') THEN RAISE EXCEPTION 'runtime may access migration ledger'; END IF;
 IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='public' AND nspowner=legacy_oid) THEN RAISE EXCEPTION 'legacy schema owner remains'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relowner=legacy_oid) THEN RAISE EXCEPTION 'legacy relation owner remains'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proowner=legacy_oid) THEN RAISE EXCEPTION 'legacy routine owner remains'; END IF;
 IF EXISTS(SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typowner=legacy_oid) THEN RAISE EXCEPTION 'legacy type owner remains'; END IF;
 IF EXISTS(SELECT 1 FROM pg_namespace n JOIN LATERAL aclexplode(n.nspacl) a ON true WHERE n.nspname='public' AND a.grantee=legacy_oid) THEN RAISE EXCEPTION 'legacy schema ACL remains'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN LATERAL aclexplode(c.relacl) a ON true WHERE n.nspname='public' AND a.grantee=legacy_oid) THEN RAISE EXCEPTION 'legacy relation ACL remains'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN LATERAL aclexplode(p.proacl) a ON true WHERE n.nspname='public' AND a.grantee=legacy_oid) THEN RAISE EXCEPTION 'legacy routine ACL remains'; END IF;
 IF EXISTS(SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN LATERAL aclexplode(t.typacl) a ON true WHERE n.nspname='public' AND a.grantee=legacy_oid) THEN RAISE EXCEPTION 'legacy type ACL remains'; END IF;
 IF EXISTS(SELECT 1 FROM pg_default_acl d JOIN LATERAL aclexplode(d.defaclacl) a ON true WHERE d.defaclrole=legacy_oid OR a.grantee=legacy_oid) THEN RAISE EXCEPTION 'legacy default ACL remains'; END IF;
 IF EXISTS(
   SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind IN('r','p','v','m','f')
     AND has_table_privilege('workspace_monitor',c.oid,'SELECT')
     AND c.relname NOT IN('Department','Position','EmployeePosition','Employee','Employment','LoginAttempt')
 ) THEN RAISE EXCEPTION 'monitor may select a non-allowlisted relation'; END IF;
 IF EXISTS(
   SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind IN('r','p','v','m','f')
     AND (has_table_privilege('workspace_monitor',c.oid,'INSERT') OR has_table_privilege('workspace_monitor',c.oid,'UPDATE') OR has_table_privilege('workspace_monitor',c.oid,'DELETE') OR has_table_privilege('workspace_monitor',c.oid,'TRUNCATE') OR has_table_privilege('workspace_monitor',c.oid,'REFERENCES') OR has_table_privilege('workspace_monitor',c.oid,'TRIGGER'))
 ) THEN RAISE EXCEPTION 'monitor has write privilege'; END IF;
 IF EXISTS(
   SELECT 1 FROM unnest(ARRAY['Department','Position','EmployeePosition','Employee','Employment','LoginAttempt']) AS required(name)
   LEFT JOIN pg_class c ON c.relname=required.name AND c.relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')
   WHERE c.oid IS NULL OR NOT has_table_privilege('workspace_monitor',c.oid,'SELECT')
 ) THEN RAISE EXCEPTION 'monitor allowlist is incomplete'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='S' AND (has_sequence_privilege('workspace_monitor',c.oid,'USAGE') OR has_sequence_privilege('workspace_monitor',c.oid,'SELECT') OR has_sequence_privilege('workspace_monitor',c.oid,'UPDATE'))) THEN RAISE EXCEPTION 'monitor has sequence privilege'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND has_function_privilege('workspace_monitor',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'monitor has routine EXECUTE'; END IF;
END $verify_workspace$;
