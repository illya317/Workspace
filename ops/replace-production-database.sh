#!/bin/bash
set -euo pipefail

COMMAND="${1:-}"
[ -n "$COMMAND" ] && shift

DUMP_FILE=""
EXPECTED_SHA=""
EXPECTED_SIZE=""
SOURCE_SHA=""
SOURCE_TREE=""
MIGRATION_SET_SHA=""
MIGRATION_COUNT=""
MIGRATIONS_DIR=""
STATE_FILE=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dump) shift; DUMP_FILE="${1:-}" ;;
    --expected-sha) shift; EXPECTED_SHA="${1:-}" ;;
    --expected-size) shift; EXPECTED_SIZE="${1:-}" ;;
    --source-sha) shift; SOURCE_SHA="${1:-}" ;;
    --source-tree) shift; SOURCE_TREE="${1:-}" ;;
    --migration-set) shift; MIGRATION_SET_SHA="${1:-}" ;;
    --migration-count) shift; MIGRATION_COUNT="${1:-}" ;;
    --migrations-dir) shift; MIGRATIONS_DIR="${1:-}" ;;
    --state-file) shift; STATE_FILE="${1:-}" ;;
    -h|--help)
      cat <<'EOF'
用法:
  replace-production-database.sh apply --dump FILE --expected-sha SHA256 --expected-size BYTES \
    --source-sha SHA --source-tree SHA --migration-set SHA256 --migration-count COUNT \
    --migrations-dir DIR --state-file FILE
  replace-production-database.sh commit --state-file FILE
  replace-production-database.sh status --state-file FILE

apply 只能在 WORKSPACE_DATABASE_REPLACEMENT_WRITERS_STOPPED=1 时执行。它将 dump
恢复到临时 PostgreSQL 数据库、验证后原子改名；旧生产数据库保留为 rollback 数据库。
EOF
      exit 0
      ;;
    *) echo "[错误] 未知参数: $1"; exit 2 ;;
  esac
  shift
done

case "$COMMAND" in apply|commit|status) ;; *) echo "[错误] 命令必须是 apply、commit 或 status"; exit 2 ;; esac
: "${STATE_FILE:?--state-file is required}"
case "$STATE_FILE" in /*) ;; *) echo "[错误] --state-file 必须是绝对路径"; exit 2 ;; esac

if [ "$COMMAND" = "status" ]; then
  [ -f "$STATE_FILE" ] || { echo "missing"; exit 0; }
  node - "$STATE_FILE" <<'NODE'
const state = JSON.parse(require('node:fs').readFileSync(process.argv[2], 'utf8'));
if (state.schemaVersion !== 1 || state.kind !== 'workspace-database-replacement-state') process.exit(1);
console.log(JSON.stringify(state, null, 2));
NODE
  exit 0
fi

if [ "$COMMAND" = "commit" ]; then
  [ -f "$STATE_FILE" ] || { echo "[错误] 数据库替换状态不存在"; exit 1; }
  : "${DIRECT_URL:?DIRECT_URL is required}"
  STATE_FILE="$STATE_FILE" DIRECT_URL="$DIRECT_URL" node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

(async () => {
  const file = process.env.STATE_FILE;
  const state = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (state.schemaVersion !== 1 || state.kind !== 'workspace-database-replacement-state') throw new Error('database replacement state is invalid');
  if (state.status === 'committed') return;
  if (state.status !== 'applied') throw new Error(`database replacement state is ${state.status}, expected applied`);
  const client = new Client({ connectionString: process.env.DIRECT_URL, application_name: 'workspace-database-replacement-commit' });
  await client.connect();
  try {
    const result = await client.query('select current_database() as name, oid::text from pg_database where datname=current_database()');
    if (result.rows[0]?.name !== state.databases.activeName || result.rows[0]?.oid !== state.databases.replacementOid) {
      throw new Error('active database is not the prepared replacement database');
    }
  } finally {
    await client.end();
  }
  const completed = { ...state, status: 'committed', committedAt: new Date().toISOString() };
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.tmp-${process.pid}`);
  fs.writeFileSync(temporary, JSON.stringify(completed, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temporary, file);
})().catch((error) => { console.error(error.message); process.exit(1); });
NODE
  echo "==> 数据库替换状态已提交；旧生产数据库继续保留作人工回滚"
  exit 0
fi

[ "${WORKSPACE_DATABASE_REPLACEMENT_WRITERS_STOPPED:-0}" = "1" ] || {
  echo "[错误] apply 要求 WORKSPACE_DATABASE_REPLACEMENT_WRITERS_STOPPED=1"; exit 1;
}
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${DIRECT_URL:?DIRECT_URL is required}"
: "${DUMP_FILE:?--dump is required}"
: "${EXPECTED_SHA:?--expected-sha is required}"
: "${EXPECTED_SIZE:?--expected-size is required}"
: "${SOURCE_SHA:?--source-sha is required}"
: "${SOURCE_TREE:?--source-tree is required}"
: "${MIGRATION_SET_SHA:?--migration-set is required}"
: "${MIGRATION_COUNT:?--migration-count is required}"
: "${MIGRATIONS_DIR:?--migrations-dir is required}"

printf '%s' "$EXPECTED_SHA" | grep -Eq '^[0-9a-f]{64}$' || { echo "[错误] dump SHA-256 无效"; exit 1; }
printf '%s' "$SOURCE_SHA" | grep -Eq '^[0-9a-f]{40}$' || { echo "[错误] source SHA 无效"; exit 1; }
printf '%s' "$SOURCE_TREE" | grep -Eq '^[0-9a-f]{40}$' || { echo "[错误] source tree SHA 无效"; exit 1; }
printf '%s' "$MIGRATION_SET_SHA" | grep -Eq '^[0-9a-f]{64}$' || { echo "[错误] migration-set SHA-256 无效"; exit 1; }
printf '%s' "$EXPECTED_SIZE" | grep -Eq '^[1-9][0-9]*$' || { echo "[错误] dump size 无效"; exit 1; }
printf '%s' "$MIGRATION_COUNT" | grep -Eq '^[1-9][0-9]*$' || { echo "[错误] migration count 无效"; exit 1; }
case "$DUMP_FILE" in /*) ;; *) echo "[错误] --dump 必须是绝对路径"; exit 1 ;; esac
case "$MIGRATIONS_DIR" in /*) ;; *) echo "[错误] --migrations-dir 必须是绝对路径"; exit 1 ;; esac
test -s "$DUMP_FILE"
test -d "$MIGRATIONS_DIR"
test "$(stat -c '%s' "$DUMP_FILE")" = "$EXPECTED_SIZE"
test "$(sha256sum "$DUMP_FILE" | awk '{print $1}')" = "$EXPECTED_SHA"
pg_restore --list "$DUMP_FILE" >/dev/null

identity="$(DATABASE_URL="$DATABASE_URL" DIRECT_URL="$DIRECT_URL" node <<'NODE'
for (const key of ['DATABASE_URL', 'DIRECT_URL']) {
  const value = process.env[key];
  if (!/^postgres(?:ql)?:\/\//.test(value ?? '')) throw new Error(`${key} must use PostgreSQL`);
}
const runtime = new URL(process.env.DATABASE_URL);
const direct = new URL(process.env.DIRECT_URL);
const endpoint = (value) => [value.hostname, value.port || '5432', value.pathname, value.searchParams.get('schema') || 'public'].join('|');
if (endpoint(runtime) !== endpoint(direct)) throw new Error('DATABASE_URL and DIRECT_URL select different databases');
const name = decodeURIComponent(direct.pathname.slice(1));
if (!/^[A-Za-z_][A-Za-z0-9_$-]{0,62}$/.test(name)) throw new Error('active database name is unsafe');
const admin = new URL(direct); admin.pathname = '/postgres';
console.log(name);
console.log(decodeURIComponent(direct.username));
console.log(admin.toString());
NODE
)"
ACTIVE_DATABASE="$(printf '%s\n' "$identity" | sed -n '1p')"
DATABASE_OWNER="$(printf '%s\n' "$identity" | sed -n '2p')"
ADMIN_URL="$(printf '%s\n' "$identity" | sed -n '3p')"

[ -n "$DATABASE_OWNER" ] || { echo "[错误] DIRECT_URL 缺少数据库用户"; exit 1; }
current_owner="$(psql "$DIRECT_URL" -XAtqc "select pg_get_userbyid(datdba) from pg_database where datname=current_database()")"
[ "$current_owner" = "$DATABASE_OWNER" ] || { echo "[错误] 当前连接用户不是生产数据库 owner"; exit 1; }
sudo -n -u postgres true >/dev/null 2>&1 || { echo "[错误] 缺少无交互 postgres sudo，无法安全创建替换库"; exit 1; }
candidate_created=0
state_durable=0
active_already_renamed=0
cleanup_candidate() {
  exit_code=$?
  if [ "$exit_code" -ne 0 ] && [ "$candidate_created" = "1" ] && [ "$state_durable" = "0" ]; then
    sudo -n -u postgres dropdb --if-exists "$CANDIDATE_DATABASE" >/dev/null 2>&1 || true
  fi
  return "$exit_code"
}
trap cleanup_candidate EXIT

candidate_names="$(ACTIVE_DATABASE="$ACTIVE_DATABASE" SOURCE_SHA="$SOURCE_SHA" node <<'NODE'
const active = process.env.ACTIVE_DATABASE;
const short = process.env.SOURCE_SHA.slice(0, 12);
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const trim = (value) => value.slice(0, 63);
console.log(trim(`ws_repl_${short}`));
console.log(trim(`${active}_rollback_${stamp}_${short.slice(0, 6)}`));
NODE
)"
CANDIDATE_DATABASE="$(printf '%s\n' "$candidate_names" | sed -n '1p')"
ROLLBACK_DATABASE="$(printf '%s\n' "$candidate_names" | sed -n '2p')"

if [ -f "$STATE_FILE" ]; then
  resume_values="$(STATE_FILE="$STATE_FILE" SOURCE_SHA="$SOURCE_SHA" SOURCE_TREE="$SOURCE_TREE" EXPECTED_SHA="$EXPECTED_SHA" MIGRATION_SET_SHA="$MIGRATION_SET_SHA" node <<'NODE'
const state = JSON.parse(require('node:fs').readFileSync(process.env.STATE_FILE, 'utf8'));
if (state.schemaVersion !== 1 || state.kind !== 'workspace-database-replacement-state'
  || !['prepared', 'applied'].includes(state.status)
  || state.source.commitSha !== process.env.SOURCE_SHA || state.source.treeSha !== process.env.SOURCE_TREE
  || state.dump.sha256 !== process.env.EXPECTED_SHA
  || state.database.migrationSetSha256 !== process.env.MIGRATION_SET_SHA) {
  throw new Error('existing database replacement state belongs to another candidate');
}
console.log(state.status);
console.log(state.databases.activeName);
console.log(state.databases.candidateName);
console.log(state.databases.rollbackName);
console.log(state.databases.activeOid);
console.log(state.databases.replacementOid);
NODE
)"
  STATE_STATUS="$(printf '%s\n' "$resume_values" | sed -n '1p')"
  ACTIVE_DATABASE="$(printf '%s\n' "$resume_values" | sed -n '2p')"
  CANDIDATE_DATABASE="$(printf '%s\n' "$resume_values" | sed -n '3p')"
  ROLLBACK_DATABASE="$(printf '%s\n' "$resume_values" | sed -n '4p')"
  ACTIVE_OID="$(printf '%s\n' "$resume_values" | sed -n '5p')"
  REPLACEMENT_OID="$(printf '%s\n' "$resume_values" | sed -n '6p')"
  actual_active_oid="$(psql "$ADMIN_URL" -XAtqc "select oid::text from pg_database where datname='$ACTIVE_DATABASE'")"
  actual_candidate_oid="$(psql "$ADMIN_URL" -XAtqc "select oid::text from pg_database where datname='$CANDIDATE_DATABASE'")"
  actual_rollback_oid="$(psql "$ADMIN_URL" -XAtqc "select oid::text from pg_database where datname='$ROLLBACK_DATABASE'")"
  if [ "$actual_active_oid" = "$REPLACEMENT_OID" ] && [ "$actual_rollback_oid" = "$ACTIVE_OID" ]; then
    STATE_FILE="$STATE_FILE" node <<'NODE'
const fs = require('node:fs'); const path = require('node:path'); const file = process.env.STATE_FILE;
const state = JSON.parse(fs.readFileSync(file, 'utf8'));
if (state.status !== 'applied') {
  const next = { ...state, status: 'applied', appliedAt: new Date().toISOString() };
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.tmp-${process.pid}`);
  fs.writeFileSync(temporary, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 }); fs.renameSync(temporary, file);
}
NODE
    echo "==> 数据库替换已由同一候选完成；复用现有原子切换"
    exit 0
  fi
  [ "$STATE_STATUS" = "prepared" ] || { echo "[错误] applied 状态与 PostgreSQL database OID 不一致"; exit 1; }
  if [ -z "$actual_active_oid" ] && [ "$actual_candidate_oid" = "$REPLACEMENT_OID" ] && [ "$actual_rollback_oid" = "$ACTIVE_OID" ]; then
    active_already_renamed=1
    echo "==> 检测到上次切换中断在旧库改名后；继续让同一替换候选接管"
  elif [ "$actual_active_oid" != "$ACTIVE_OID" ] || [ "$actual_candidate_oid" != "$REPLACEMENT_OID" ] || [ -n "$actual_rollback_oid" ]; then
    echo "[错误] prepared 状态与 PostgreSQL database OID 不一致，拒绝猜测恢复"; exit 1
  fi
else
  [ -z "$(psql "$ADMIN_URL" -XAtqc "select datname from pg_database where datname in ('$CANDIDATE_DATABASE','$ROLLBACK_DATABASE')")" ] || {
    echo "[错误] 候选或回滚数据库名已存在且没有绑定状态，拒绝处理"; exit 1;
  }
  sudo -n -u postgres createdb --owner="$DATABASE_OWNER" --template=template0 "$CANDIDATE_DATABASE"
  candidate_created=1
  CANDIDATE_URL="$(DIRECT_URL="$DIRECT_URL" CANDIDATE_DATABASE="$CANDIDATE_DATABASE" node -e 'const u=new URL(process.env.DIRECT_URL); u.pathname="/"+process.env.CANDIDATE_DATABASE; process.stdout.write(u.toString())')"
  if ! pg_restore --dbname="$CANDIDATE_URL" --no-owner --no-privileges "$DUMP_FILE"; then
    sudo -n -u postgres dropdb --if-exists "$CANDIDATE_DATABASE"
    echo "[错误] 恢复数据库替换候选失败" >&2
    exit 1
  fi
  node "$(dirname "$0")/../scripts/check/check-prisma-deploy-status.js" \
    --database-url "$CANDIDATE_URL" --migrations-dir "$MIGRATIONS_DIR"
  restored_migration_count="$(psql "$CANDIDATE_URL" -XAtqc 'select count(*) from "_prisma_migrations" where finished_at is not null and rolled_back_at is null')"
  [ "$restored_migration_count" = "$MIGRATION_COUNT" ] || { echo "[错误] 替换库 migration 数量与候选不一致"; exit 1; }
  user_count="$(psql "$CANDIDATE_URL" -XAtqc 'select count(*) from "User"')"
  invalid_constraints="$(psql "$CANDIDATE_URL" -XAtqc "select count(*) from pg_constraint where connamespace='public'::regnamespace and not convalidated")"
  [ "$user_count" -gt 0 ] || { echo "[错误] 替换库没有用户数据"; exit 1; }
  [ "$invalid_constraints" = "0" ] || { echo "[错误] 替换库存在未验证约束"; exit 1; }
  ACTIVE_OID="$(psql "$ADMIN_URL" -XAtqc "select oid::text from pg_database where datname='$ACTIVE_DATABASE'")"
  REPLACEMENT_OID="$(psql "$ADMIN_URL" -XAtqc "select oid::text from pg_database where datname='$CANDIDATE_DATABASE'")"
  mkdir -p "$(dirname "$STATE_FILE")"
  STATE_FILE="$STATE_FILE" SOURCE_SHA="$SOURCE_SHA" SOURCE_TREE="$SOURCE_TREE" EXPECTED_SHA="$EXPECTED_SHA" EXPECTED_SIZE="$EXPECTED_SIZE" \
    MIGRATION_SET_SHA="$MIGRATION_SET_SHA" MIGRATION_COUNT="$MIGRATION_COUNT" ACTIVE_DATABASE="$ACTIVE_DATABASE" \
    CANDIDATE_DATABASE="$CANDIDATE_DATABASE" ROLLBACK_DATABASE="$ROLLBACK_DATABASE" ACTIVE_OID="$ACTIVE_OID" REPLACEMENT_OID="$REPLACEMENT_OID" node <<'NODE'
const fs = require('node:fs'); const path = require('node:path'); const file = process.env.STATE_FILE;
const state = {
  schemaVersion: 1, kind: 'workspace-database-replacement-state', status: 'prepared',
  source: { commitSha: process.env.SOURCE_SHA, treeSha: process.env.SOURCE_TREE },
  dump: { sha256: process.env.EXPECTED_SHA, sizeBytes: Number(process.env.EXPECTED_SIZE) },
  database: { migrationSetSha256: process.env.MIGRATION_SET_SHA, migrationCount: Number(process.env.MIGRATION_COUNT) },
  databases: {
    activeName: process.env.ACTIVE_DATABASE, candidateName: process.env.CANDIDATE_DATABASE,
    rollbackName: process.env.ROLLBACK_DATABASE, activeOid: process.env.ACTIVE_OID, replacementOid: process.env.REPLACEMENT_OID,
  },
  preparedAt: new Date().toISOString(),
};
const temporary = path.join(path.dirname(file), `.${path.basename(file)}.tmp-${process.pid}`);
fs.writeFileSync(temporary, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 }); fs.renameSync(temporary, file);
NODE
  state_durable=1
fi

candidate_created=0
state_durable=1
actual_candidate_oid="$(psql "$ADMIN_URL" -XAtqc "select oid::text from pg_database where datname='$CANDIDATE_DATABASE'")"
[ "$actual_candidate_oid" = "$REPLACEMENT_OID" ] || { echo "[错误] 替换候选 database OID 与持久状态不一致"; exit 1; }
sudo -n -u postgres psql -Xv ON_ERROR_STOP=1 -d postgres -qc "select pg_terminate_backend(pid) from pg_stat_activity where datname in ('$ACTIVE_DATABASE','$CANDIDATE_DATABASE') and pid <> pg_backend_pid()"
if [ "$active_already_renamed" = "0" ]; then
  sudo -n -u postgres psql -Xv ON_ERROR_STOP=1 -d postgres -qc "alter database \"$ACTIVE_DATABASE\" rename to \"$ROLLBACK_DATABASE\""
fi
if ! sudo -n -u postgres psql -Xv ON_ERROR_STOP=1 -d postgres -qc "alter database \"$CANDIDATE_DATABASE\" rename to \"$ACTIVE_DATABASE\""; then
  sudo -n -u postgres psql -Xv ON_ERROR_STOP=1 -d postgres -qc "alter database \"$ROLLBACK_DATABASE\" rename to \"$ACTIVE_DATABASE\""
  echo "[错误] 替换库接管失败，已恢复原生产数据库名" >&2
  exit 1
fi

STATE_FILE="$STATE_FILE" node <<'NODE'
const fs = require('node:fs'); const path = require('node:path'); const file = process.env.STATE_FILE;
const state = JSON.parse(fs.readFileSync(file, 'utf8'));
const applied = { ...state, status: 'applied', appliedAt: new Date().toISOString() };
const temporary = path.join(path.dirname(file), `.${path.basename(file)}.tmp-${process.pid}`);
fs.writeFileSync(temporary, JSON.stringify(applied, null, 2) + '\n', { mode: 0o600 }); fs.renameSync(temporary, file);
NODE

echo "==> PostgreSQL 整库替换已原子切换"
echo "    active:   $ACTIVE_DATABASE (OID $REPLACEMENT_OID)"
echo "    rollback: $ROLLBACK_DATABASE (OID $ACTIVE_OID)"
trap - EXIT
