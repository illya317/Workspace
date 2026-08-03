#!/usr/bin/env bash
set -euo pipefail
umask 077

readonly EXPECTED_COMPOSE_ROOT="/home/ubuntu/workspace-dev/postgresql-security"
readonly DATABASE_CONTAINER="workspace-dev-db"
readonly APP_CONTAINER="workspace-dev"
readonly DOCKER_SOCKET="/run/docker.sock"
readonly REQUEST_PREFIX="postgresqlOperationRequest:"
readonly RUNTIME_SECRET_RELATIVE="secrets/workspace_dev_runtime_password"
readonly ROTATION_JOURNAL_RELATIVE="runtime/sql-settings-worker/password-rotation.json"

execute="${WORKSPACE_SQL_SETTINGS_EXECUTE:-0}"
compose_root="${WORKSPACE_DEV_POSTGRESQL_COMPOSE_ROOT:-}"
health_attempts="${WORKSPACE_SQL_SETTINGS_HEALTH_ATTEMPTS:-30}"
active_request_key=""
active_operation=""
rotation_active=0
rotation_role_changed=0
rotation_secret_changed=0
rotation_old_password=""
rotation_phase="not-started"
rotation_terminal_status="reconciliation_required"
rotation_terminal_error="RECONCILIATION_REQUIRED"

fail() {
  printf '[workspace-sql-settings] %s\n' "$1" >&2
  exit 1
}

case "$execute" in
  1) ;;
  *) fail "execution is disabled; set WORKSPACE_SQL_SETTINGS_EXECUTE=1 explicitly" ;;
esac
case "$compose_root" in
  /*) ;;
  *) fail "WORKSPACE_DEV_POSTGRESQL_COMPOSE_ROOT must be an explicit absolute path" ;;
esac
compose_root="$(realpath -e -- "$compose_root")"
[ "$compose_root" = "$EXPECTED_COMPOSE_ROOT" ] || fail "the explicit Compose root is not the governed development root"
[ "$(id -u)" -eq 0 ] || fail "the SQL settings worker must run as root"
[ -S "$DOCKER_SOCKET" ] || fail "the governed Docker socket is unavailable"
export DOCKER_HOST="unix://$DOCKER_SOCKET"
[ -f "$compose_root/compose.yaml" ] && [ -f "$compose_root/.env" ] || fail "the governed development Compose inputs are missing"
grep -Eq '^name:[[:space:]]+workspace-dev-secure$' "$compose_root/compose.yaml" \
  || fail "the Compose project contract is invalid"
grep -Eq '^[[:space:]]+container_name:[[:space:]]+workspace-dev-db$' "$compose_root/compose.yaml" \
  || fail "the PostgreSQL container contract is invalid"
[[ "$health_attempts" =~ ^[1-9][0-9]*$ ]] && [ "$health_attempts" -le 60 ] \
  || fail "WORKSPACE_SQL_SETTINGS_HEALTH_ATTEMPTS must be between 1 and 60"
for required_command in docker node openssl curl realpath stat mktemp install chmod chown mv rm id; do
  command -v "$required_command" >/dev/null || fail "a required host command is unavailable"
done

docker_psql() {
  docker exec -i -u postgres "$DATABASE_CONTAINER" \
    psql -X -v ON_ERROR_STOP=1 -U workspace_dev -d workspace_dev "$@"
}

read -r -d '' claim_sql <<'SQL' || true
WITH queue AS MATERIALIZED (
  SELECT "key", "value"::jsonb AS payload
  FROM "SystemConfig"
  WHERE "key" LIKE 'postgresqlOperationRequest:%'
), candidate AS MATERIALIZED (
  SELECT "key"
  FROM queue
  WHERE (payload ->> 'status') = 'pending'
  ORDER BY COALESCE(payload ->> 'createdAt', ''), "key"
  FOR UPDATE SKIP LOCKED
  LIMIT 1
), claimed AS (
  UPDATE "SystemConfig" AS request
  SET "value" = (
    request."value"::jsonb
    || jsonb_build_object(
      'status', 'running',
      'startedAt', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )
  )::text
  FROM candidate
  WHERE request."key" = candidate."key"
  RETURNING request."key", request."value"
)
SELECT "key" || '|' || translate(encode(convert_to("value", 'UTF8'), 'base64'), E'\n', '')
FROM claimed;
SQL

mark_invalid_request() {
  local request_key=$1
  docker_psql -Atq -v "request_key=$request_key" >/dev/null 2>&1 <<'SQL'
WITH updated AS (
  UPDATE "SystemConfig"
  SET "value" = (
    "value"::jsonb
    || jsonb_build_object(
    'status', 'failed',
    'errorCode', 'INVALID_REQUEST',
    'message', 'Request failed SQL worker validation.',
    'completedAt', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )
  )::text
  WHERE "key" = :'request_key'
    AND ("value"::jsonb ->> 'status') = 'running'
  RETURNING 1
)
SELECT 1 / count(*)::integer FROM updated;
SQL
}

mark_operation_status() {
  local request_key=$1 operation=$2 status=$3 error_code=$4 message=$5
  docker_psql -Atq \
    -v "request_key=$request_key" \
    -v "operation=$operation" \
    -v "request_status=$status" \
    -v "error_code=$error_code" \
    -v "message=$message" >/dev/null 2>&1 <<'SQL'
WITH updated AS (
  UPDATE "SystemConfig"
  SET "value" = (
    "value"::jsonb - 'errorCode' - 'message' - 'completedAt'
    || jsonb_build_object(
      'operation', :'operation',
      'status', :'request_status',
      'message', :'message',
      'completedAt', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )
    || CASE
      WHEN :'error_code' = '' THEN '{}'::jsonb
      ELSE jsonb_build_object('errorCode', :'error_code')
    END
  )::text
  WHERE "key" = :'request_key'
    AND ("value"::jsonb ->> 'status') = 'running'
  RETURNING 1
)
SELECT 1 / count(*)::integer FROM updated;
SQL
}

write_rotation_journal() {
  local journal_status=$1 journal_phase=$2
  local journal_path="$compose_root/$ROTATION_JOURNAL_RELATIVE"
  local journal_directory="${journal_path%/*}" runtime_directory="$compose_root/runtime" temporary
  [[ "$active_request_key" =~ ^postgresqlOperationRequest:[A-Za-z0-9_-]{1,128}$ ]] || return 1
  case "$journal_status" in
    running|succeeded|failed|reconciliation_required) ;;
    *) return 1 ;;
  esac
  [[ "$journal_phase" =~ ^[a-z0-9-]{1,64}$ ]] || return 1
  [ ! -L "$runtime_directory" ] && [ ! -L "$journal_directory" ] && [ ! -L "$journal_path" ] || return 1
  install -d -o root -g root -m 0700 "$journal_directory" || return 1
  [ "$(stat -c %u "$journal_directory")" = 0 ] && [ "$(stat -c %a "$journal_directory")" = 700 ] || return 1
  temporary="$(mktemp "$journal_directory/.password-rotation.XXXXXX")" || return 1
  if ! node - "$temporary" "$active_request_key" "$journal_status" "$journal_phase" <<'NODE'
const fs = require("node:fs");
const [journalPath, requestKey, status, phase] = process.argv.slice(2);
const journal = {
  schemaVersion: 1,
  kind: "workspace-dev-postgresql-password-rotation",
  requestKey,
  operation: "rotate-runtime-password",
  status,
  phase,
  updatedAt: new Date().toISOString(),
};
fs.writeFileSync(journalPath, `${JSON.stringify(journal)}\n`, { encoding: "utf8", mode: 0o600 });
NODE
  then
    rm -f -- "$temporary"
    return 1
  fi
  chmod 0600 "$temporary" || { rm -f -- "$temporary"; return 1; }
  chown root:root "$temporary" || { rm -f -- "$temporary"; return 1; }
  mv -f -- "$temporary" "$journal_path" || { rm -f -- "$temporary"; return 1; }
  [ ! -L "$journal_path" ] \
    && [ "$(stat -c %u "$journal_path")" = 0 ] \
    && [ "$(stat -c %a "$journal_path")" = 600 ]
}

read_rotation_journal() {
  local journal_path="$compose_root/$ROTATION_JOURNAL_RELATIVE"
  [ -e "$journal_path" ] || return 1
  [ -f "$journal_path" ] && [ ! -L "$journal_path" ] \
    && [ "$(stat -c %u "$journal_path")" = 0 ] \
    && [ "$(stat -c %a "$journal_path")" = 600 ] || return 2
  node - "$journal_path" <<'NODE'
const fs = require("node:fs");
try {
  const journal = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const keys = Object.keys(journal).sort();
  const expectedKeys = ["kind", "operation", "phase", "requestKey", "schemaVersion", "status", "updatedAt"].sort();
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) process.exit(1);
  if (journal.schemaVersion !== 1 || journal.kind !== "workspace-dev-postgresql-password-rotation"
    || journal.operation !== "rotate-runtime-password") process.exit(1);
  if (!/^postgresqlOperationRequest:[A-Za-z0-9_-]{1,128}$/.test(journal.requestKey)) process.exit(1);
  if (!new Set(["running", "succeeded", "failed", "reconciliation_required"]).has(journal.status)) process.exit(1);
  if (!/^[a-z0-9-]{1,64}$/.test(journal.phase)) process.exit(1);
  if (typeof journal.updatedAt !== "string" || Number.isNaN(Date.parse(journal.updatedAt))) process.exit(1);
  process.stdout.write([journal.requestKey, journal.status, journal.phase].join("\n"));
} catch {
  process.exit(1);
}
NODE
}

check_rotation_journal() {
  local journal_path="$compose_root/$ROTATION_JOURNAL_RELATIVE" journal_fields
  local -a journal_parts
  [ -e "$journal_path" ] || return 0
  if ! journal_fields="$(read_rotation_journal)"; then
    fail "the password-rotation journal is invalid"
  fi
  mapfile -t journal_parts <<<"$journal_fields"
  [ "${#journal_parts[@]}" -eq 3 ] || fail "the password-rotation journal is malformed"
  active_request_key="${journal_parts[0]}"
  active_operation="rotate-runtime-password"
  case "${journal_parts[1]}" in
    failed)
      mark_operation_status "$active_request_key" "$active_operation" failed PASSWORD_ROTATION_FAILED \
        "Password rotation failed and was rolled back." >/dev/null 2>&1 || true
      active_request_key=""
      active_operation=""
      ;;
    succeeded)
      mark_operation_status "$active_request_key" "$active_operation" succeeded "" \
        "Password rotation completed." >/dev/null 2>&1 || true
      active_request_key=""
      active_operation=""
      ;;
    running)
      write_rotation_journal reconciliation_required interrupted-before-result >/dev/null 2>&1 || true
      mark_operation_status "$active_request_key" "$active_operation" reconciliation_required RECONCILIATION_REQUIRED \
        "Password rotation requires manual reconciliation." >/dev/null 2>&1 || true
      docker stop "$APP_CONTAINER" >/dev/null 2>&1 || true
      fail "an interrupted password rotation requires manual reconciliation"
      ;;
    reconciliation_required)
      mark_operation_status "$active_request_key" "$active_operation" reconciliation_required RECONCILIATION_REQUIRED \
        "Password rotation requires manual reconciliation." >/dev/null 2>&1 || true
      docker stop "$APP_CONTAINER" >/dev/null 2>&1 || true
      fail "password rotation remains in reconciliation_required"
      ;;
    *) fail "the password-rotation journal status is invalid" ;;
  esac
}

validate_request() {
  local encoded_payload=$1
  printf '%s' "$encoded_payload" | node -e '
    let encoded = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { encoded += chunk; });
    process.stdin.on("end", () => {
      try {
        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) process.exit(1);
        const decoded = Buffer.from(encoded, "base64");
        if (decoded.toString("base64") !== encoded) process.exit(1);
        const request = JSON.parse(decoded.toString("utf8"));
        if (!request || Array.isArray(request) || typeof request !== "object") process.exit(1);
        const common = [
          "operation", "status", "reason", "requestedByUserId", "createdAt", "startedAt",
          "idempotencyHash", "requestFingerprint",
        ];
        const allowed = request.operation === "set-runtime-setting"
          ? new Set([...common, "settingKey", "requestedValue", "expectedCurrentValueMs"])
          : request.operation === "rotate-runtime-password"
            ? new Set(common)
            : null;
        if (!allowed || Object.keys(request).some((key) => !allowed.has(key))) process.exit(1);
        if (request.status !== "running") process.exit(1);
        const safeText = (value, maximum) => typeof value === "string"
          && value.length > 0 && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value);
        if (!safeText(request.reason, 500) || !Number.isSafeInteger(request.requestedByUserId)
          || request.requestedByUserId <= 0) process.exit(1);
        const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
        if (!timestamp.test(request.createdAt || "") || Number.isNaN(Date.parse(request.createdAt))) process.exit(1);
        if (!timestamp.test(request.startedAt || "") || Number.isNaN(Date.parse(request.startedAt))) process.exit(1);
        if (!/^[0-9a-f]{64}$/.test(request.idempotencyHash || "")
          || !/^[0-9a-f]{64}$/.test(request.requestFingerprint || "")) process.exit(1);
        if (request.operation === "set-runtime-setting"
          && (!safeText(request.settingKey, 64) || !safeText(request.requestedValue, 32)
            || !Number.isSafeInteger(request.expectedCurrentValueMs)
            || request.expectedCurrentValueMs < 0 || request.expectedCurrentValueMs > 86400000)) process.exit(1);
        process.stdout.write([
          request.operation,
          request.operation === "set-runtime-setting" ? request.settingKey : "-",
          request.operation === "set-runtime-setting" ? request.requestedValue : "-",
          request.operation === "set-runtime-setting" ? String(request.expectedCurrentValueMs) : "-",
        ].join("\n"));
      } catch {
        process.exit(1);
      }
    });
  '
}

validate_runtime_setting() {
  local setting_key=$1 setting_value=$2
  case "$setting_key" in
    statement_timeout)
      case "$setting_value" in 30s|60s|120s|300s) ;; *) return 1 ;; esac
      ;;
    lock_timeout)
      case "$setting_value" in 1s|5s|10s|30s) ;; *) return 1 ;; esac
      ;;
    idle_in_transaction_session_timeout)
      case "$setting_value" in 30s|60s|120s|300s) ;; *) return 1 ;; esac
      ;;
    *) return 1 ;;
  esac
}

runtime_setting_value_ms() {
  local setting_key=$1 setting_value=$2
  validate_runtime_setting "$setting_key" "$setting_value" || return 1
  case "$setting_value" in
    1s) printf '1000\n' ;;
    5s) printf '5000\n' ;;
    10s) printf '10000\n' ;;
    30s) printf '30000\n' ;;
    60s) printf '60000\n' ;;
    120s) printf '120000\n' ;;
    300s) printf '300000\n' ;;
    *) return 1 ;;
  esac
}

read_runtime_setting_ms() {
  local setting_key=$1
  docker exec -i -u postgres "$DATABASE_CONTAINER" /bin/bash -s -- "$setting_key" 2>/dev/null <<'BASH'
set -euo pipefail
setting_key="$1"
case "$setting_key" in
  statement_timeout|lock_timeout|idle_in_transaction_session_timeout) ;;
  *) exit 2 ;;
esac
runtime_password="$(</var/lib/postgresql/tls/private/workspace_dev_runtime_password)"
[[ "$runtime_password" =~ ^[0-9a-f]{64}$ ]] || exit 3
PGPASSWORD="$runtime_password" \
PGSSLMODE=verify-full \
PGSSLROOTCERT=/var/lib/postgresql/tls/ca.crt \
psql -X -v ON_ERROR_STOP=1 -h db -U workspace_dev_runtime -d workspace_dev \
  -v "setting_key=$setting_key" -Atqc "SELECT setting FROM pg_settings WHERE name = :'setting_key' AND unit = 'ms'"
unset runtime_password PGPASSWORD
BASH
}

apply_runtime_setting() {
  local setting_key=$1 setting_value=$2
  validate_runtime_setting "$setting_key" "$setting_value" || return 1
  docker_psql -Atq >/dev/null 2>&1 <<SQL
BEGIN;
ALTER ROLE workspace_dev_runtime IN DATABASE workspace_dev SET ${setting_key} = '${setting_value}';
SELECT 1 / count(*)::integer
FROM pg_db_role_setting AS role_setting
CROSS JOIN LATERAL unnest(role_setting.setconfig) AS config(value)
WHERE role_setting.setrole = 'workspace_dev_runtime'::regrole
  AND role_setting.setdatabase = (SELECT oid FROM pg_database WHERE datname = 'workspace_dev')
  AND config.value = '${setting_key}=${setting_value}';
COMMIT;
SQL
}

write_runtime_secret() {
  local secret_value=$1 secret_file="$compose_root/$RUNTIME_SECRET_RELATIVE" temporary owner group mode
  [ -f "$secret_file" ] && [ ! -L "$secret_file" ] || return 1
  owner="$(stat -c %u "$secret_file")"
  group="$(stat -c %g "$secret_file")"
  mode="$(stat -c %a "$secret_file")"
  [ "$mode" = 600 ] || return 1
  temporary="$(mktemp "$compose_root/secrets/.workspace-runtime-password.XXXXXX")" || return 1
  if ! printf '%s' "$secret_value" >"$temporary"; then
    rm -f -- "$temporary"
    return 1
  fi
  chmod 0600 "$temporary" || { rm -f -- "$temporary"; return 1; }
  chown "$owner:$group" "$temporary" || { rm -f -- "$temporary"; return 1; }
  mv -f -- "$temporary" "$secret_file"
}

set_runtime_role_password() {
  local password=$1
  {
    printf '\\set ON_ERROR_STOP on\n'
    printf '\\set runtime_password %s\n' "$password"
    printf "ALTER ROLE workspace_dev_runtime PASSWORD :'runtime_password';\n"
  } | docker_psql >/dev/null 2>&1
}

recreate_app() {
  docker compose \
    --project-name workspace-dev-secure \
    --env-file "$compose_root/.env" \
    --file "$compose_root/compose.yaml" \
    up -d --no-deps --force-recreate app >/dev/null 2>&1
}

verify_app_health() {
  local attempt status
  for ((attempt=1; attempt<=health_attempts; attempt+=1)); do
    status="$(docker inspect --format '{{.State.Health.Status}}' "$APP_CONTAINER" 2>/dev/null || true)"
    if [ "$status" = healthy ] \
      && curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3100/test/login >/dev/null 2>&1; then
      return 0
    fi
    [ "$attempt" -eq "$health_attempts" ] || sleep 2
  done
  return 1
}

rollback_rotation() {
  local rollback_ok=1
  if [ "$rotation_role_changed" = 1 ]; then
    set_runtime_role_password "$rotation_old_password" || rollback_ok=0
  fi
  if [ "$rotation_secret_changed" = 1 ]; then
    write_runtime_secret "$rotation_old_password" || rollback_ok=0
  fi
  if [ "$rotation_role_changed" = 1 ] || [ "$rotation_secret_changed" = 1 ]; then
    recreate_app || rollback_ok=0
    verify_app_health || rollback_ok=0
  fi
  if [ "$rollback_ok" != 1 ]; then
    docker stop "$APP_CONTAINER" >/dev/null 2>&1 || true
    return 1
  fi
  return 0
}

finish_rotation_failure() {
  if rollback_rotation; then
    rotation_role_changed=0
    rotation_secret_changed=0
    rotation_phase="rolled-back"
    rotation_terminal_status="failed"
    rotation_terminal_error="PASSWORD_ROTATION_FAILED"
    if ! write_rotation_journal failed rolled-back; then
      rotation_terminal_status="reconciliation_required"
      rotation_terminal_error="RECONCILIATION_REQUIRED"
      rotation_phase="journal-write-failed"
      docker stop "$APP_CONTAINER" >/dev/null 2>&1 || true
    fi
  else
    rotation_phase="rollback-incomplete"
    rotation_terminal_status="reconciliation_required"
    rotation_terminal_error="RECONCILIATION_REQUIRED"
    write_rotation_journal reconciliation_required rollback-incomplete >/dev/null 2>&1 || true
    docker stop "$APP_CONTAINER" >/dev/null 2>&1 || true
  fi
  return 1
}

cleanup() {
  local status=$?
  trap - EXIT
  if [ "$rotation_active" = 1 ]; then
    case "$rotation_terminal_status" in
      failed)
        write_rotation_journal failed rolled-back >/dev/null 2>&1 || true
        mark_operation_status "$active_request_key" "$active_operation" failed "$rotation_terminal_error" \
          "Password rotation failed and was rolled back." >/dev/null 2>&1 || true
        ;;
      *)
        write_rotation_journal reconciliation_required "interrupted-${rotation_phase}" >/dev/null 2>&1 || true
        mark_operation_status "$active_request_key" "$active_operation" reconciliation_required RECONCILIATION_REQUIRED \
          "Password rotation requires manual reconciliation." >/dev/null 2>&1 || true
        docker stop "$APP_CONTAINER" >/dev/null 2>&1 || true
        ;;
    esac
  fi
  unset rotation_old_password
  exit "$status"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

rotate_runtime_password() {
  local secret_file="$compose_root/$RUNTIME_SECRET_RELATIVE" new_password
  rotation_terminal_status="failed"
  rotation_terminal_error="PASSWORD_ROTATION_FAILED"
  [ -f "$secret_file" ] && [ ! -L "$secret_file" ] || return 1
  rotation_old_password="$(<"$secret_file")"
  [[ "$rotation_old_password" =~ ^[0-9a-f]{64}$ ]] || return 1
  new_password="$(openssl rand -hex 32 2>/dev/null)" || return 1
  [[ "$new_password" =~ ^[0-9a-f]{64}$ ]] && [ "$new_password" != "$rotation_old_password" ] || return 1
  rotation_active=1
  rotation_phase="before-role-change"
  rotation_terminal_status="reconciliation_required"
  rotation_terminal_error="RECONCILIATION_REQUIRED"
  if ! write_rotation_journal running before-role-change; then
    rotation_active=0
    rotation_terminal_status="failed"
    rotation_terminal_error="ROTATION_JOURNAL_FAILED"
    unset new_password rotation_old_password
    return 1
  fi
  rotation_role_changed=1
  if ! set_runtime_role_password "$new_password"; then
    unset new_password
    finish_rotation_failure
    return
  fi
  rotation_phase="role-changed"
  if ! write_rotation_journal running role-changed; then
    unset new_password
    finish_rotation_failure
    return
  fi
  rotation_secret_changed=1
  if ! write_runtime_secret "$new_password"; then
    unset new_password
    finish_rotation_failure
    return
  fi
  rotation_phase="secret-replaced"
  if ! write_rotation_journal running secret-replaced || ! recreate_app; then
    unset new_password
    finish_rotation_failure
    return
  fi
  rotation_phase="app-recreated"
  if ! write_rotation_journal running app-recreated || ! verify_app_health; then
    unset new_password
    finish_rotation_failure
    return
  fi
  rotation_phase="health-verified"
  if ! write_rotation_journal running health-verified; then
    unset new_password
    finish_rotation_failure
    return
  fi
  unset new_password
}

check_rotation_journal

claim="$(docker_psql -Atqc "$claim_sql")" || fail "could not atomically claim a PostgreSQL operation request"
[ -n "$claim" ] || exit 0
case "$claim" in *$'\n'*) fail "the claim returned more than one request" ;; esac
request_key="${claim%%|*}"
encoded_payload="${claim#*|}"
[ "$request_key" != "$claim" ] || fail "the claimed request payload is malformed"
[[ "$request_key" =~ ^postgresqlOperationRequest:[A-Za-z0-9_-]{1,128}$ ]] \
  || fail "the claimed request key is outside the governed prefix"
active_request_key="$request_key"

if ! request_fields="$(validate_request "$encoded_payload")"; then
  mark_invalid_request "$request_key" || fail "the invalid request could not be sealed"
  fail "the claimed request failed validation"
fi
mapfile -t request_parts <<<"$request_fields"
[ "${#request_parts[@]}" -eq 4 ] || {
  mark_invalid_request "$request_key" || true
  fail "the claimed request fields are malformed"
}
operation="${request_parts[0]}"
setting_key="${request_parts[1]}"
setting_value="${request_parts[2]}"
expected_current_value_ms="${request_parts[3]}"
active_operation="$operation"

case "$operation" in
  set-runtime-setting)
    if ! target_value_ms="$(runtime_setting_value_ms "$setting_key" "$setting_value")"; then
      mark_operation_status "$request_key" "$operation" failed INVALID_SETTING \
        "The requested runtime setting is not allowed." \
        || fail "the invalid setting request could not be sealed"
      fail "the runtime setting request is outside the allowlist"
    fi
    if ! actual_current_value_ms="$(read_runtime_setting_ms "$setting_key")" \
      || [[ ! "$actual_current_value_ms" =~ ^[0-9]+$ ]]; then
      mark_operation_status "$request_key" "$operation" failed SETTING_READ_FAILED \
        "The current runtime setting could not be read." \
        || fail "the unreadable setting request could not be sealed"
      fail "the current runtime setting could not be read"
    fi
    if [ "$actual_current_value_ms" != "$expected_current_value_ms" ]; then
      mark_operation_status "$request_key" "$operation" failed STALE_SETTING \
        "The expected runtime setting no longer matches PostgreSQL." \
        || fail "the stale setting request could not be sealed"
      fail "the runtime setting request is stale"
    fi
    if [ "$setting_key" = statement_timeout ]; then
      current_statement_timeout_ms="$actual_current_value_ms"
    elif ! current_statement_timeout_ms="$(read_runtime_setting_ms statement_timeout)"; then
      current_statement_timeout_ms=""
    fi
    if [ "$setting_key" = lock_timeout ]; then
      current_lock_timeout_ms="$actual_current_value_ms"
    elif ! current_lock_timeout_ms="$(read_runtime_setting_ms lock_timeout)"; then
      current_lock_timeout_ms=""
    fi
    if [[ ! "$current_statement_timeout_ms" =~ ^[0-9]+$ ]] \
      || [[ ! "$current_lock_timeout_ms" =~ ^[0-9]+$ ]]; then
      mark_operation_status "$request_key" "$operation" failed SETTING_READ_FAILED \
        "The current timeout relation could not be read." \
        || fail "the unreadable timeout relation could not be sealed"
      fail "the timeout relation could not be read"
    fi
    effective_statement_timeout_ms="$current_statement_timeout_ms"
    effective_lock_timeout_ms="$current_lock_timeout_ms"
    [ "$setting_key" != statement_timeout ] || effective_statement_timeout_ms="$target_value_ms"
    [ "$setting_key" != lock_timeout ] || effective_lock_timeout_ms="$target_value_ms"
    if [ "$effective_lock_timeout_ms" -ge "$effective_statement_timeout_ms" ]; then
      mark_operation_status "$request_key" "$operation" failed INVALID_TIMEOUT_RELATION \
        "lock_timeout must be lower than statement_timeout." \
        || fail "the invalid timeout relation could not be sealed"
      fail "lock_timeout must remain lower than statement_timeout"
    fi
    if ! apply_runtime_setting "$setting_key" "$setting_value"; then
      mark_operation_status "$request_key" "$operation" failed SETTING_APPLY_FAILED \
        "PostgreSQL rejected the requested runtime setting." \
        || fail "the failed setting request could not be sealed"
      fail "the runtime setting request failed"
    fi
    if ! observed_value_ms="$(read_runtime_setting_ms "$setting_key")" \
      || [[ ! "$observed_value_ms" =~ ^[0-9]+$ ]] \
      || [ "$observed_value_ms" != "$target_value_ms" ]; then
      mark_operation_status "$request_key" "$operation" failed SETTING_VERIFY_FAILED \
        "The observed runtime setting does not match the requested value." \
        || fail "the unverified setting request could not be sealed"
      fail "the runtime setting observation did not match the requested value"
    fi
    if [ "$setting_key" = statement_timeout ]; then
      observed_statement_timeout_ms="$observed_value_ms"
    elif ! observed_statement_timeout_ms="$(read_runtime_setting_ms statement_timeout)"; then
      observed_statement_timeout_ms=""
    fi
    if [ "$setting_key" = lock_timeout ]; then
      observed_lock_timeout_ms="$observed_value_ms"
    elif ! observed_lock_timeout_ms="$(read_runtime_setting_ms lock_timeout)"; then
      observed_lock_timeout_ms=""
    fi
    if [[ ! "$observed_statement_timeout_ms" =~ ^[0-9]+$ ]] \
      || [[ ! "$observed_lock_timeout_ms" =~ ^[0-9]+$ ]] \
      || [ "$observed_lock_timeout_ms" -ge "$observed_statement_timeout_ms" ]; then
      mark_operation_status "$request_key" "$operation" failed SETTING_VERIFY_FAILED \
        "The observed timeout relation is invalid." \
        || fail "the invalid observed timeout relation could not be sealed"
      fail "the observed timeout relation is invalid"
    fi
    ;;
  rotate-runtime-password)
    if ! rotate_runtime_password; then
      if [ "$rotation_terminal_status" = failed ]; then
        rotation_terminal_message="Password rotation failed and was rolled back."
      else
        rotation_terminal_message="Password rotation requires manual reconciliation."
      fi
      mark_operation_status "$request_key" "$operation" "$rotation_terminal_status" "$rotation_terminal_error" \
        "$rotation_terminal_message" \
        || fail "the password rotation result could not be sealed"
      rotation_active=0
      rotation_role_changed=0
      rotation_secret_changed=0
      unset rotation_old_password
      fail "the runtime password request did not complete"
    fi
    ;;
  *)
    mark_invalid_request "$request_key" || fail "the invalid request could not be sealed"
    fail "the requested operation is not allowed"
    ;;
esac

mark_operation_status "$request_key" "$operation" succeeded "" \
  "PostgreSQL operation completed." \
  || fail "the completed request could not be sealed"
if [ "$operation" = rotate-runtime-password ]; then
  write_rotation_journal succeeded completed \
    || fail "the successful password rotation journal could not be sealed"
  rotation_active=0
  rotation_role_changed=0
  rotation_secret_changed=0
  unset rotation_old_password
fi
printf '[workspace-sql-settings] completed request %s\n' "$request_key"
