#!/usr/bin/env bash
set -euo pipefail
umask 077

readonly EXPECTED_COMPOSE_ROOT="/home/ubuntu/workspace-dev/postgresql-security"
readonly EXPECTED_WORKER_PATH="/usr/local/lib/workspace-postgresql-dev/sql-settings-worker.sh"
readonly DATABASE_CONTAINER="workspace-dev-db"
readonly APP_CONTAINER="workspace-dev"
readonly DOCKER_SOCKET="/run/docker.sock"
readonly REQUEST_PREFIX="postgresqlOperationRequest:"
readonly RUNTIME_SECRET_RELATIVE="secrets/workspace_dev_runtime_password"
readonly REQUEST_HMAC_SECRET_RELATIVE="secrets/workspace_dev_sql_settings_request_hmac"
readonly ROTATION_JOURNAL_PATH="/var/lib/workspace-postgresql-dev/password-rotation.json"
readonly RECEIPT_LEDGER_PATH="/var/lib/workspace-postgresql-dev/sql-settings-receipts.json"
readonly RECEIPT_LEDGER_LOCK_PATH="/var/lib/workspace-postgresql-dev/sql-settings-receipts.lock"
readonly WORKER_LOCK_PATH="/var/lib/workspace-postgresql-dev/sql-settings-worker.lock"
readonly RECEIPT_LEDGER_LIMIT=4096

execute="${WORKSPACE_SQL_SETTINGS_EXECUTE:-0}"
compose_root="${WORKSPACE_DEV_POSTGRESQL_COMPOSE_ROOT:-}"
health_attempts="${WORKSPACE_SQL_SETTINGS_HEALTH_ATTEMPTS:-30}"
approved_password_request="${WORKSPACE_SQL_SETTINGS_APPROVE_PASSWORD_REQUEST:-}"
active_request_key=""
active_operation=""
active_request_id=""
active_request_signature=""
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
worker_path="$(realpath -e -- "${BASH_SOURCE[0]}")"
[ "$worker_path" = "$EXPECTED_WORKER_PATH" ] || fail "the worker is not running from its governed installation path"
[ -f "$worker_path" ] && [ ! -L "$worker_path" ] || fail "the governed worker must be a regular file"
[ "$(stat -c %u:%g "$worker_path")" = 0:0 ] \
  && [ "$(stat -c %a "$worker_path")" = 700 ] \
  || fail "the governed worker must be root:root mode 0700"
worker_directory="${worker_path%/*}"
[ "$(stat -c %u:%g "$worker_directory")" = 0:0 ] \
  && [ $((8#$(stat -c %a "$worker_directory") & 8#022)) -eq 0 ] \
  || fail "the governed worker directory must be root-owned and not writable by group or others"
case "$compose_root" in
  /*) ;;
  *) fail "WORKSPACE_DEV_POSTGRESQL_COMPOSE_ROOT must be an explicit absolute path" ;;
esac
compose_root="$(realpath -e -- "$compose_root")"
[ "$compose_root" = "$EXPECTED_COMPOSE_ROOT" ] || fail "the explicit Compose root is not the governed development root"
[ "$(id -u)" -eq 0 ] || fail "the SQL settings worker must run as root"
[ -S "$DOCKER_SOCKET" ] || fail "the governed Docker socket is unavailable"
export DOCKER_HOST="unix://$DOCKER_SOCKET"
[ -d "$compose_root" ] && [ ! -L "$compose_root" ] \
  && [ "$(stat -c %u:%g "$compose_root")" = 0:0 ] \
  && [ "$(stat -c %a "$compose_root")" = 700 ] \
  || fail "the governed development runtime root must be root:root mode 0700"
for governed_compose_file in compose.yaml .env app.env; do
  governed_compose_path="$compose_root/$governed_compose_file"
  [ -f "$governed_compose_path" ] && [ ! -L "$governed_compose_path" ] \
    && [ "$(stat -c %u:%g "$governed_compose_path")" = 0:0 ] \
    && [ $((8#$(stat -c %a "$governed_compose_path") & 8#022)) -eq 0 ] \
    || fail "the governed Compose input $governed_compose_file must be root-owned and immutable to non-root users"
done
secrets_directory="$compose_root/secrets"
[ -d "$secrets_directory" ] && [ ! -L "$secrets_directory" ] \
  && [ "$(stat -c %u:%g "$secrets_directory")" = 0:0 ] \
  && [ "$(stat -c %a "$secrets_directory")" = 700 ] \
  || fail "the governed secrets directory must be root:root mode 0700"
request_hmac_secret_file="$compose_root/$REQUEST_HMAC_SECRET_RELATIVE"
[ -f "$request_hmac_secret_file" ] && [ ! -L "$request_hmac_secret_file" ] \
  && [ "$(stat -c %u:%g "$request_hmac_secret_file")" = 1000:1000 ] \
  && [ "$(stat -c %a "$request_hmac_secret_file")" = 600 ] \
  || fail "the request-signing secret must be owned by the fixed application uid/gid 1000:1000 with mode 0600"
if [ -n "$approved_password_request" ]; then
  [[ "$approved_password_request" =~ ^postgresqlOperationRequest:[A-Za-z0-9_-]{1,128}$ ]] \
    || fail "WORKSPACE_SQL_SETTINGS_APPROVE_PASSWORD_REQUEST must be one complete governed request key"
fi
[[ "$health_attempts" =~ ^[1-9][0-9]*$ ]] && [ "$health_attempts" -le 60 ] \
  || fail "WORKSPACE_SQL_SETTINGS_HEALTH_ATTEMPTS must be between 1 and 60"
for required_command in docker node openssl curl realpath stat mktemp install chmod chown mv rm id flock; do
  command -v "$required_command" >/dev/null || fail "a required host command is unavailable"
done

worker_state_directory="${WORKER_LOCK_PATH%/*}"
[ ! -L "$worker_state_directory" ] && [ ! -L "$WORKER_LOCK_PATH" ] \
  || fail "the SQL settings worker lock path must not contain a symlink"
install -d -o root -g root -m 0700 "$worker_state_directory" \
  || fail "the SQL settings worker state directory could not be prepared"
if [ ! -e "$WORKER_LOCK_PATH" ]; then
  install -o root -g root -m 0600 /dev/null "$WORKER_LOCK_PATH" \
    || fail "the SQL settings worker lock could not be created"
fi
[ -f "$WORKER_LOCK_PATH" ] && [ ! -L "$WORKER_LOCK_PATH" ] \
  && [ "$(stat -c %u:%g "$WORKER_LOCK_PATH")" = 0:0 ] \
  && [ "$(stat -c %a "$WORKER_LOCK_PATH")" = 600 ] \
  || fail "the SQL settings worker lock must be root:root mode 0600"
exec 8>>"$WORKER_LOCK_PATH" || fail "the SQL settings worker lock could not be opened"
flock -n 8 || fail "another SQL settings worker is already active"

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
    AND (
      (:'approved_password_request' = '' AND (payload ->> 'operation') = 'set-runtime-setting')
      OR (
        :'approved_password_request' <> ''
        AND "key" = :'approved_password_request'
        AND (payload ->> 'operation') = 'rotate-runtime-password'
      )
    )
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

read -r -d '' recovery_scan_sql <<'SQL' || true
/* SQL_SETTINGS_RECOVERY_SCAN */
WITH queue AS MATERIALIZED (
  SELECT "key", "value"::jsonb AS payload
  FROM "SystemConfig"
  WHERE "key" LIKE 'postgresqlOperationRequest:%'
)
SELECT "key" || '|' || translate(encode(convert_to(payload::text, 'UTF8'), 'base64'), E'\n', '')
FROM queue
WHERE (payload ->> 'status') = 'running'
  AND (payload ->> 'operation') = 'set-runtime-setting'
  AND CASE
    WHEN (payload ->> 'startedAt') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,3})?Z$'
    THEN (payload ->> 'startedAt')::timestamptz <= clock_timestamp() - interval '15 minutes'
    ELSE false
  END
ORDER BY COALESCE(payload ->> 'createdAt', ''), "key";
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

prepare_receipt_ledger() {
  local ledger_directory="${RECEIPT_LEDGER_PATH%/*}"
  [ ! -L "$ledger_directory" ] && [ ! -L "$RECEIPT_LEDGER_PATH" ] \
    && [ ! -L "$RECEIPT_LEDGER_LOCK_PATH" ] || return 1
  install -d -o root -g root -m 0700 "$ledger_directory" || return 1
  [ "$(stat -c %u:%g "$ledger_directory")" = 0:0 ] \
    && [ "$(stat -c %a "$ledger_directory")" = 700 ] || return 1
  if [ ! -e "$RECEIPT_LEDGER_LOCK_PATH" ]; then
    install -o root -g root -m 0600 /dev/null "$RECEIPT_LEDGER_LOCK_PATH" || return 1
  fi
  [ -f "$RECEIPT_LEDGER_LOCK_PATH" ] && [ ! -L "$RECEIPT_LEDGER_LOCK_PATH" ] \
    && [ "$(stat -c %u:%g "$RECEIPT_LEDGER_LOCK_PATH")" = 0:0 ] \
    && [ "$(stat -c %a "$RECEIPT_LEDGER_LOCK_PATH")" = 600 ]
}

record_receipt() {
  local request_id=$1 request_signature=$2 operation=$3 outcome=$4 error_code=$5 message=$6
  local ledger_directory="${RECEIPT_LEDGER_PATH%/*}" temporary node_status
  [[ "$request_id" =~ ^[A-Za-z0-9_-]{1,128}$ ]] \
    && [[ "$request_signature" =~ ^[0-9a-f]{64}$ ]] || return 1
  case "$operation" in set-runtime-setting|rotate-runtime-password) ;; *) return 1 ;; esac
  case "$outcome" in succeeded|failed|reconciliation_required) ;; *) return 1 ;; esac
  [[ "$error_code" =~ ^[A-Z0-9_]{0,64}$ ]] || return 1
  [ -n "$message" ] && [ "${#message}" -le 500 ] \
    && [[ ! "$message" =~ [$'\001'-$'\037'$'\177'] ]] || return 1
  prepare_receipt_ledger || return 1
  exec 9>>"$RECEIPT_LEDGER_LOCK_PATH" || return 1
  flock -x 9 || { exec 9>&-; return 1; }
  if [ -e "$RECEIPT_LEDGER_PATH" ]; then
    [ -f "$RECEIPT_LEDGER_PATH" ] && [ ! -L "$RECEIPT_LEDGER_PATH" ] \
      && [ "$(stat -c %u:%g "$RECEIPT_LEDGER_PATH")" = 0:0 ] \
      && [ "$(stat -c %a "$RECEIPT_LEDGER_PATH")" = 600 ] \
      || { flock -u 9; exec 9>&-; return 1; }
  fi
  temporary="$(mktemp "$ledger_directory/.sql-settings-receipts.XXXXXX")" \
    || { flock -u 9; exec 9>&-; return 1; }
  if node - "$RECEIPT_LEDGER_PATH" "$temporary" "$RECEIPT_LEDGER_LIMIT" \
    "$request_id" "$request_signature" "$operation" "$outcome" "$error_code" "$message" <<'NODE'
const fs = require("node:fs");
const [ledgerPath, temporaryPath, limitText, requestId, requestSignature, operation, outcome, errorCode, message] = process.argv.slice(2);
const limit = Number(limitText);
const emptyLedger = { schemaVersion: 1, receipts: [] };
let ledger = emptyLedger;
if (fs.existsSync(ledgerPath)) ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
if (!ledger || ledger.schemaVersion !== 1 || !Array.isArray(ledger.receipts)
  || Object.keys(ledger).sort().join(",") !== "receipts,schemaVersion") process.exit(2);
if (!Number.isSafeInteger(limit) || limit < 1 || ledger.receipts.length > limit) process.exit(2);
for (const receipt of ledger.receipts) {
  if (!receipt || Object.keys(receipt).sort().join(",") !== "errorCode,message,operation,outcome,recordedAt,requestId,requestSignature"
    || !/^[A-Za-z0-9_-]{1,128}$/.test(receipt.requestId)
    || !/^[0-9a-f]{64}$/.test(receipt.requestSignature)
    || !new Set(["set-runtime-setting", "rotate-runtime-password"]).has(receipt.operation)
    || !new Set(["succeeded", "failed", "reconciliation_required"]).has(receipt.outcome)
    || !/^[A-Z0-9_]{0,64}$/.test(receipt.errorCode)
    || typeof receipt.message !== "string" || receipt.message.length < 1 || receipt.message.length > 500
    || /[\u0000-\u001f\u007f]/.test(receipt.message)
    || typeof receipt.recordedAt !== "string" || Number.isNaN(Date.parse(receipt.recordedAt))) process.exit(2);
}
const existing = ledger.receipts.find((receipt) => receipt.requestId === requestId);
if (existing) {
  if (existing.requestSignature !== requestSignature) process.exit(3);
  if (existing.operation !== operation || existing.outcome !== outcome
    || existing.errorCode !== errorCode || existing.message !== message) process.exit(4);
  process.exit(0);
}
if (ledger.receipts.length >= limit) process.exit(5);
ledger.receipts.push({ requestId, requestSignature, operation, outcome, errorCode, message, recordedAt: new Date().toISOString() });
fs.writeFileSync(temporaryPath, `${JSON.stringify(ledger)}\n`, { encoding: "utf8", mode: 0o600 });
NODE
  then
    node_status=0
  else
    node_status=$?
  fi
  if [ "$node_status" -eq 0 ] && [ -s "$temporary" ]; then
    chmod 0600 "$temporary" \
      && chown root:root "$temporary" \
      && mv -f -- "$temporary" "$RECEIPT_LEDGER_PATH" \
      || node_status=2
  fi
  rm -f -- "$temporary"
  flock -u 9 || true
  exec 9>&-
  return "$node_status"
}

lookup_receipt() {
  local request_id=$1 request_signature=$2 node_status
  [[ "$request_id" =~ ^[A-Za-z0-9_-]{1,128}$ ]] \
    && [[ "$request_signature" =~ ^[0-9a-f]{64}$ ]] || return 2
  prepare_receipt_ledger || return 2
  [ -e "$RECEIPT_LEDGER_PATH" ] || return 1
  [ -f "$RECEIPT_LEDGER_PATH" ] && [ ! -L "$RECEIPT_LEDGER_PATH" ] \
    && [ "$(stat -c %u:%g "$RECEIPT_LEDGER_PATH")" = 0:0 ] \
    && [ "$(stat -c %a "$RECEIPT_LEDGER_PATH")" = 600 ] || return 2
  exec 9>>"$RECEIPT_LEDGER_LOCK_PATH" || return 2
  flock -s 9 || { exec 9>&-; return 2; }
  if node - "$RECEIPT_LEDGER_PATH" "$request_id" "$request_signature" <<'NODE'
const fs = require("node:fs");
const [ledgerPath, requestId, requestSignature] = process.argv.slice(2);
try {
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
  if (!ledger || ledger.schemaVersion !== 1 || !Array.isArray(ledger.receipts) || ledger.receipts.length > 4096) process.exit(2);
  const receipt = ledger.receipts.find((entry) => entry && entry.requestId === requestId);
  if (!receipt) process.exit(1);
  if (receipt.requestSignature !== requestSignature) process.exit(3);
  if (!new Set(["set-runtime-setting", "rotate-runtime-password"]).has(receipt.operation)
    || !new Set(["succeeded", "failed", "reconciliation_required"]).has(receipt.outcome)
    || !/^[A-Z0-9_]{0,64}$/.test(receipt.errorCode || "")
    || typeof receipt.message !== "string" || receipt.message.length < 1 || receipt.message.length > 500
    || /[\u0000-\u001f\u007f]/.test(receipt.message)) process.exit(2);
  process.stdout.write([receipt.operation, receipt.outcome, receipt.errorCode, receipt.message].join("\n"));
} catch {
  process.exit(2);
}

NODE
  then
    node_status=0
  else
    node_status=$?
  fi
  flock -u 9 || true
  exec 9>&-
  return "$node_status"
}

validate_receipt_ledger() {
  local node_status
  prepare_receipt_ledger || return 1
  [ -e "$RECEIPT_LEDGER_PATH" ] || return 0
  [ -f "$RECEIPT_LEDGER_PATH" ] && [ ! -L "$RECEIPT_LEDGER_PATH" ] \
    && [ "$(stat -c %u:%g "$RECEIPT_LEDGER_PATH")" = 0:0 ] \
    && [ "$(stat -c %a "$RECEIPT_LEDGER_PATH")" = 600 ] || return 1
  exec 9>>"$RECEIPT_LEDGER_LOCK_PATH" || return 1
  flock -s 9 || { exec 9>&-; return 1; }
  if node - "$RECEIPT_LEDGER_PATH" "$RECEIPT_LEDGER_LIMIT" <<'NODE'
const fs = require("node:fs");
const [ledgerPath, limitText] = process.argv.slice(2);
try {
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
  const limit = Number(limitText);
  if (!ledger || ledger.schemaVersion !== 1 || !Array.isArray(ledger.receipts)
    || Object.keys(ledger).sort().join(",") !== "receipts,schemaVersion"
    || !Number.isSafeInteger(limit) || limit < 1 || ledger.receipts.length > limit) process.exit(1);
  const requestIds = new Set();
  for (const receipt of ledger.receipts) {
    if (!receipt || Object.keys(receipt).sort().join(",") !== "errorCode,message,operation,outcome,recordedAt,requestId,requestSignature"
      || !/^[A-Za-z0-9_-]{1,128}$/.test(receipt.requestId)
      || requestIds.has(receipt.requestId)
      || !/^[0-9a-f]{64}$/.test(receipt.requestSignature)
      || !new Set(["set-runtime-setting", "rotate-runtime-password"]).has(receipt.operation)
      || !new Set(["succeeded", "failed", "reconciliation_required"]).has(receipt.outcome)
      || !/^[A-Z0-9_]{0,64}$/.test(receipt.errorCode)
      || typeof receipt.message !== "string" || receipt.message.length < 1 || receipt.message.length > 500
      || /[\u0000-\u001f\u007f]/.test(receipt.message)
      || typeof receipt.recordedAt !== "string" || Number.isNaN(Date.parse(receipt.recordedAt))) process.exit(1);
    requestIds.add(receipt.requestId);
  }
} catch {
  process.exit(1);
}
NODE
  then
    node_status=0
  else
    node_status=$?
  fi
  flock -u 9 || true
  exec 9>&-
  return "$node_status"
}

seal_operation_status() {
  local request_key=$1 request_id=$2 request_signature=$3 operation=$4 status=$5 error_code=$6 message=$7
  record_receipt "$request_id" "$request_signature" "$operation" "$status" "$error_code" "$message" \
    || return 1
  mark_operation_status "$request_key" "$operation" "$status" "$error_code" "$message"
}

replay_claimed_receipt() {
  local receipt_fields lookup_status
  local -a receipt_parts
  if receipt_fields="$(lookup_receipt "$active_request_id" "$active_request_signature")"; then
    mapfile -t receipt_parts <<<"$receipt_fields"
    [ "${#receipt_parts[@]}" -eq 4 ] && [ "${receipt_parts[0]}" = "$active_operation" ] \
      || fail "the matching receipt is malformed"
    mark_operation_status "$active_request_key" "$active_operation" \
      "${receipt_parts[1]}" "${receipt_parts[2]}" "${receipt_parts[3]}" \
      || fail "the matching receipt result could not be replayed"
    return 0
  else
    lookup_status=$?
  fi
  case "$lookup_status" in
    1) return 1 ;;
    3)
      mark_operation_status "$active_request_key" "$active_operation" reconciliation_required \
        RECEIPT_SIGNATURE_CONFLICT "A receipt with this requestId has a different signature." \
        || fail "the receipt signature conflict could not be sealed"
      return 0
      ;;
    *) fail "the receipt ledger is invalid or unavailable" ;;
  esac
}

write_rotation_journal() {
  local journal_status=$1 journal_phase=$2
  local journal_path="$ROTATION_JOURNAL_PATH"
  local journal_directory="${journal_path%/*}" temporary
  [[ "$active_request_key" =~ ^postgresqlOperationRequest:[A-Za-z0-9_-]{1,128}$ ]] || return 1
  [[ "$active_request_id" =~ ^[A-Za-z0-9_-]{1,128}$ ]] \
    && [[ "$active_request_signature" =~ ^[0-9a-f]{64}$ ]] \
    && [ "$active_request_key" = "postgresqlOperationRequest:$active_request_id" ] || return 1
  case "$journal_status" in
    running|succeeded|failed|reconciliation_required) ;;
    *) return 1 ;;
  esac
  [[ "$journal_phase" =~ ^[a-z0-9-]{1,64}$ ]] || return 1
  [ ! -L "$journal_directory" ] && [ ! -L "$journal_path" ] || return 1
  install -d -o root -g root -m 0700 "$journal_directory" || return 1
  [ "$(stat -c %u "$journal_directory")" = 0 ] && [ "$(stat -c %a "$journal_directory")" = 700 ] || return 1
  temporary="$(mktemp "$journal_directory/.password-rotation.XXXXXX")" || return 1
  if ! node - "$temporary" "$active_request_key" "$active_request_id" "$active_request_signature" \
    "$journal_status" "$journal_phase" <<'NODE'
const fs = require("node:fs");
const [journalPath, requestKey, requestId, requestSignature, status, phase] = process.argv.slice(2);
const journal = {
  schemaVersion: 1,
  kind: "workspace-dev-postgresql-password-rotation",
  requestKey,
  requestId,
  requestSignature,
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
  local journal_path="$ROTATION_JOURNAL_PATH"
  [ -e "$journal_path" ] || return 1
  [ -f "$journal_path" ] && [ ! -L "$journal_path" ] \
    && [ "$(stat -c %u "$journal_path")" = 0 ] \
    && [ "$(stat -c %a "$journal_path")" = 600 ] || return 2
  node - "$journal_path" <<'NODE'
const fs = require("node:fs");
try {
  const journal = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const keys = Object.keys(journal).sort();
  const expectedKeys = ["kind", "operation", "phase", "requestId", "requestKey", "requestSignature", "schemaVersion", "status", "updatedAt"].sort();
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) process.exit(1);
  if (journal.schemaVersion !== 1 || journal.kind !== "workspace-dev-postgresql-password-rotation"
    || journal.operation !== "rotate-runtime-password") process.exit(1);
  if (!/^postgresqlOperationRequest:[A-Za-z0-9_-]{1,128}$/.test(journal.requestKey)) process.exit(1);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(journal.requestId)
    || journal.requestKey !== `postgresqlOperationRequest:${journal.requestId}`
    || !/^[0-9a-f]{64}$/.test(journal.requestSignature)) process.exit(1);
  if (!new Set(["running", "succeeded", "failed", "reconciliation_required"]).has(journal.status)) process.exit(1);
  if (!/^[a-z0-9-]{1,64}$/.test(journal.phase)) process.exit(1);
  if (typeof journal.updatedAt !== "string" || Number.isNaN(Date.parse(journal.updatedAt))) process.exit(1);
  process.stdout.write([journal.requestKey, journal.status, journal.phase, journal.requestId, journal.requestSignature].join("\n"));
} catch {
  process.exit(1);
}
NODE
}

check_rotation_journal() {
  local journal_path="$ROTATION_JOURNAL_PATH" journal_fields
  local -a journal_parts
  [ -e "$journal_path" ] || return 0
  if ! journal_fields="$(read_rotation_journal)"; then
    fail "the password-rotation journal is invalid"
  fi
  mapfile -t journal_parts <<<"$journal_fields"
  [ "${#journal_parts[@]}" -eq 5 ] || fail "the password-rotation journal is malformed"
  active_request_key="${journal_parts[0]}"
  active_operation="rotate-runtime-password"
  active_request_id="${journal_parts[3]}"
  active_request_signature="${journal_parts[4]}"
  case "${journal_parts[1]}" in
    failed)
      seal_operation_status "$active_request_key" "$active_request_id" "$active_request_signature" \
        "$active_operation" failed PASSWORD_ROTATION_FAILED \
        "Password rotation failed and was rolled back." >/dev/null 2>&1 \
        || fail "the failed password-rotation receipt could not be replayed"
      active_request_key=""
      active_operation=""
      active_request_id=""
      active_request_signature=""
      ;;
    succeeded)
      seal_operation_status "$active_request_key" "$active_request_id" "$active_request_signature" \
        "$active_operation" succeeded "" \
        "Password rotation completed." >/dev/null 2>&1 \
        || fail "the successful password-rotation receipt could not be replayed"
      active_request_key=""
      active_operation=""
      active_request_id=""
      active_request_signature=""
      ;;
    running)
      write_rotation_journal reconciliation_required interrupted-before-result >/dev/null 2>&1 \
        || fail "the interrupted password-rotation journal could not be sealed"
      seal_operation_status "$active_request_key" "$active_request_id" "$active_request_signature" \
        "$active_operation" reconciliation_required RECONCILIATION_REQUIRED \
        "Password rotation requires manual reconciliation." >/dev/null 2>&1 \
        || fail "the interrupted password-rotation receipt could not be sealed"
      docker stop "$APP_CONTAINER" >/dev/null 2>&1 || true
      fail "an interrupted password rotation requires manual reconciliation"
      ;;
    reconciliation_required)
      seal_operation_status "$active_request_key" "$active_request_id" "$active_request_signature" \
        "$active_operation" reconciliation_required RECONCILIATION_REQUIRED \
        "Password rotation requires manual reconciliation." >/dev/null 2>&1 || true
      docker stop "$APP_CONTAINER" >/dev/null 2>&1 || true
      fail "password rotation remains in reconciliation_required"
      ;;
    *) fail "the password-rotation journal status is invalid" ;;
  esac
}

validate_request() {
  local encoded_payload=$1 request_key=$2
  printf '%s' "$encoded_payload" | node -e '
    const fs = require("node:fs");
    const crypto = require("node:crypto");
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
          "requestId", "operation", "status", "reason", "requestedByUserId", "createdAt", "startedAt",
          "completedAt", "message", "idempotencyHash", "requestFingerprint", "requestSignature",
          "settingKey", "requestedValue", "expectedCurrentValueMs",
        ];
        const allowed = request.operation === "set-runtime-setting"
          || request.operation === "rotate-runtime-password"
          ? new Set(common)
          : null;
        if (!allowed || Object.keys(request).some((key) => !allowed.has(key))) process.exit(1);
        if (request.status !== "running") process.exit(1);
        const requestKey = process.argv[2];
        const keyPrefix = "postgresqlOperationRequest:";
        if (!requestKey.startsWith(keyPrefix)
          || !/^[A-Za-z0-9_-]{1,128}$/.test(request.requestId || "")
          || request.requestId !== requestKey.slice(keyPrefix.length)) process.exit(1);
        const safeText = (value, maximum) => typeof value === "string"
          && value.length > 0 && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value);
        if (!safeText(request.reason, 500) || !Number.isSafeInteger(request.requestedByUserId)
          || request.requestedByUserId <= 0) process.exit(1);
        const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
        if (!timestamp.test(request.createdAt || "") || Number.isNaN(Date.parse(request.createdAt))) process.exit(1);
        if (!timestamp.test(request.startedAt || "") || Number.isNaN(Date.parse(request.startedAt))) process.exit(1);
        if (request.completedAt !== null || request.message !== null) process.exit(1);
        if (!/^[0-9a-f]{64}$/.test(request.idempotencyHash || "")
          || !/^[0-9a-f]{64}$/.test(request.requestFingerprint || "")) process.exit(1);
        if (request.operation === "set-runtime-setting"
          && (!safeText(request.settingKey, 64) || !safeText(request.requestedValue, 32)
            || !Number.isSafeInteger(request.expectedCurrentValueMs)
            || request.expectedCurrentValueMs <= 0 || request.expectedCurrentValueMs > 86400000)) process.exit(1);
        if (request.operation === "rotate-runtime-password"
          && (request.settingKey !== null || request.requestedValue !== null
            || request.expectedCurrentValueMs !== null)) process.exit(1);
        if (!/^[0-9a-f]{64}$/.test(request.requestSignature || "")) process.exit(1);
        const hmacSecret = fs.readFileSync(process.argv[1], "utf8").trim();
        if (!/^[0-9a-f]{64}$/.test(hmacSecret)) process.exit(1);
        const canonical = JSON.stringify({
          requestId: request.requestId ?? null,
          operation: request.operation ?? null,
          settingKey: request.settingKey ?? null,
          requestedValue: request.requestedValue ?? null,
          expectedCurrentValueMs: request.expectedCurrentValueMs ?? null,
          reason: request.reason ?? null,
          requestedByUserId: request.requestedByUserId ?? null,
          createdAt: request.createdAt ?? null,
          idempotencyHash: request.idempotencyHash ?? null,
          requestFingerprint: request.requestFingerprint ?? null,
        });
        const expectedSignature = crypto.createHmac("sha256", hmacSecret).update(canonical).digest();
        const suppliedSignature = Buffer.from(request.requestSignature, "hex");
        if (suppliedSignature.length !== expectedSignature.length
          || !crypto.timingSafeEqual(suppliedSignature, expectedSignature)) process.exit(1);
        process.stdout.write([
          request.operation,
          request.operation === "set-runtime-setting" ? request.settingKey : "-",
          request.operation === "set-runtime-setting" ? request.requestedValue : "-",
          request.operation === "set-runtime-setting" ? String(request.expectedCurrentValueMs) : "-",
          request.requestId,
          request.requestSignature,
        ].join("\n"));
      } catch {
        process.exit(1);
      }
    });
  ' "$request_hmac_secret_file" "$request_key"
}

validate_runtime_setting() {
  local setting_key=$1 setting_value=$2
  case "$setting_key" in
    statement_timeout)
      case "$setting_value" in 30s|60s|120s|300s|900s) ;; *) return 1 ;; esac
      ;;
    lock_timeout)
      case "$setting_value" in 5s|10s|15s|30s) ;; *) return 1 ;; esac
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
    5s) printf '5000\n' ;;
    10s) printf '10000\n' ;;
    15s) printf '15000\n' ;;
    30s) printf '30000\n' ;;
    60s) printf '60000\n' ;;
    120s) printf '120000\n' ;;
    300s) printf '300000\n' ;;
    900s) printf '900000\n' ;;
    *) return 1 ;;
  esac
}

read_runtime_setting_ms() {
  local setting_key=$1 secret_file="$compose_root/$RUNTIME_SECRET_RELATIVE" runtime_password
  [ -f "$secret_file" ] && [ ! -L "$secret_file" ] || return 1
  runtime_password="$(<"$secret_file")"
  [[ "$runtime_password" =~ ^[0-9a-f]{64}$ ]] || return 1
  printf '%s\n' "$runtime_password" | docker exec -i -u postgres "$DATABASE_CONTAINER" \
    /bin/bash -c 'set -euo pipefail
setting_key="$1"
case "$setting_key" in
  statement_timeout|lock_timeout|idle_in_transaction_session_timeout) ;;
  *) exit 2 ;;
esac
IFS= read -r runtime_password
[[ "$runtime_password" =~ ^[0-9a-f]{64}$ ]] || exit 3
PGPASSWORD="$runtime_password" \
PGSSLMODE=verify-full \
PGSSLROOTCERT=/var/lib/postgresql/tls/ca.crt \
psql -X -v ON_ERROR_STOP=1 -h db -U workspace_dev_runtime -d workspace_dev \
  -Atqc "SELECT setting FROM pg_settings WHERE name = \$\$$setting_key\$\$ AND unit = \$\$ms\$\$"
unset runtime_password PGPASSWORD' -- "$setting_key" 2>/dev/null
  local status=$?
  unset runtime_password
  return "$status"
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

requeue_setting_request() {
  local request_key=$1
  docker_psql -Atq -v "request_key=$request_key" >/dev/null 2>&1 <<'SQL'
/* SQL_SETTINGS_RECOVERY_REQUEUE */
WITH updated AS (
  UPDATE "SystemConfig"
  SET "value" = (
    "value"::jsonb - 'startedAt' - 'errorCode' - 'message' - 'completedAt'
    || jsonb_build_object('status', 'pending')
  )::text
  WHERE "key" = :'request_key'
    AND ("value"::jsonb ->> 'status') = 'running'
    AND ("value"::jsonb ->> 'operation') = 'set-runtime-setting'
  RETURNING 1
)
SELECT 1 / count(*)::integer FROM updated;
SQL
}

recover_running_settings() {
  local recovery_rows row request_key encoded_payload request_fields operation setting_key setting_value
  local expected_current_value_ms target_value_ms actual_value_ms request_id request_signature
  local -a request_parts
  if ! recovery_rows="$(docker_psql -Atqc "$recovery_scan_sql")"; then
    fail "could not scan running PostgreSQL setting requests"
  fi
  [ -n "$recovery_rows" ] || return 0
  while IFS= read -r row; do
    case "$row" in *$'\r'*|*$'\n'*) fail "the recovery scan returned a malformed row" ;; esac
    request_key="${row%%|*}"
    encoded_payload="${row#*|}"
    [ "$request_key" != "$row" ] \
      && [[ "$request_key" =~ ^postgresqlOperationRequest:[A-Za-z0-9_-]{1,128}$ ]] \
      || fail "the recovery scan returned an invalid request key"
    active_request_key="$request_key"
    active_operation="set-runtime-setting"
    if ! request_fields="$(validate_request "$encoded_payload" "$request_key")"; then
      mark_invalid_request "$request_key" || fail "an invalid running setting request could not be sealed"
      continue
    fi
    mapfile -t request_parts <<<"$request_fields"
    if [ "${#request_parts[@]}" -ne 6 ] || [ "${request_parts[0]}" != set-runtime-setting ]; then
      mark_invalid_request "$request_key" || fail "a malformed running setting request could not be sealed"
      continue
    fi
    operation="${request_parts[0]}"
    setting_key="${request_parts[1]}"
    setting_value="${request_parts[2]}"
    expected_current_value_ms="${request_parts[3]}"
    request_id="${request_parts[4]}"
    request_signature="${request_parts[5]}"
    active_request_id="$request_id"
    active_request_signature="$request_signature"
    if replay_claimed_receipt; then
      continue
    fi
    if ! target_value_ms="$(runtime_setting_value_ms "$setting_key" "$setting_value")"; then
      seal_operation_status "$request_key" "$request_id" "$request_signature" "$operation" failed INVALID_SETTING \
        "The requested runtime setting is not allowed." \
        || fail "an invalid recovered setting request could not be sealed"
      continue
    fi
    if ! actual_value_ms="$(read_runtime_setting_ms "$setting_key")" \
      || [[ ! "$actual_value_ms" =~ ^[0-9]+$ ]]; then
      seal_operation_status "$request_key" "$request_id" "$request_signature" "$operation" reconciliation_required SETTING_READ_FAILED \
        "The interrupted runtime setting cannot be reconciled because PostgreSQL could not be read." \
        || fail "an unreadable recovered setting request could not be sealed"
      continue
    fi
    if [ "$actual_value_ms" = "$target_value_ms" ]; then
      seal_operation_status "$request_key" "$request_id" "$request_signature" "$operation" succeeded "" \
        "The interrupted runtime setting was already applied and verified." \
        || fail "a completed recovered setting request could not be sealed"
    elif [ "$actual_value_ms" = "$expected_current_value_ms" ]; then
      requeue_setting_request "$request_key" \
        || fail "an unapplied recovered setting request could not be returned to pending"
    else
      seal_operation_status "$request_key" "$request_id" "$request_signature" "$operation" reconciliation_required SETTING_STATE_DIVERGED \
        "The interrupted runtime setting differs from both expected and requested values." \
        || fail "a divergent recovered setting request could not be sealed"
    fi
  done <<<"$recovery_rows"
  active_request_key=""
  active_operation=""
  active_request_id=""
  active_request_signature=""
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

restart_app() {
  docker compose \
    --project-directory "$compose_root" \
    --env-file "$compose_root/.env" \
    -f "$compose_root/compose.yaml" \
    up -d --no-deps --force-recreate app >/dev/null 2>&1
}

verify_app_database_connection() {
  docker exec -i -u 1000 -w /workspace "$APP_CONTAINER" /bin/bash -s <<'BASH' >/dev/null 2>&1
set -euo pipefail
node <<'NODE'
const fs = require("node:fs");
const { Client } = require("pg");
const password = fs.readFileSync("/run/secrets/workspace_dev_runtime_password", "utf8").trim();
const ca = fs.readFileSync("/run/secrets/postgres_ca", "utf8");
const client = new Client({
  host: "db",
  port: 5432,
  database: "workspace_dev",
  user: "workspace_dev_runtime",
  password,
  ssl: { ca, servername: "db", rejectUnauthorized: true },
  connectionTimeoutMillis: 5_000,
});
client.connect()
  .then(() => client.query("SELECT 1"))
  .then(() => client.end())
  .catch(() => process.exit(1));
NODE
BASH
}

verify_app_health() {
  local attempt status
  for ((attempt=1; attempt<=health_attempts; attempt+=1)); do
    status="$(docker inspect --format '{{.State.Health.Status}}' "$APP_CONTAINER" 2>/dev/null || true)"
    if [ "$status" = healthy ] \
      && curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3100/test/login >/dev/null 2>&1 \
      && verify_app_database_connection; then
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
    restart_app || rollback_ok=0
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
      succeeded)
        write_rotation_journal succeeded completed >/dev/null 2>&1 || true
        seal_operation_status "$active_request_key" "$active_request_id" "$active_request_signature" \
          "$active_operation" succeeded "" "PostgreSQL operation completed." >/dev/null 2>&1 || true
        ;;
      failed)
        write_rotation_journal failed rolled-back >/dev/null 2>&1 || true
        seal_operation_status "$active_request_key" "$active_request_id" "$active_request_signature" \
          "$active_operation" failed "$rotation_terminal_error" \
          "Password rotation failed and was rolled back." >/dev/null 2>&1 || true
        ;;
      *)
        write_rotation_journal reconciliation_required "interrupted-${rotation_phase}" >/dev/null 2>&1 || true
        seal_operation_status "$active_request_key" "$active_request_id" "$active_request_signature" \
          "$active_operation" reconciliation_required RECONCILIATION_REQUIRED \
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
  if ! write_rotation_journal running secret-replaced || ! restart_app; then
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

validate_receipt_ledger || fail "the SQL settings receipt ledger is invalid or unavailable"
check_rotation_journal
recover_running_settings

claim="$(docker_psql -v "approved_password_request=$approved_password_request" -Atqc "$claim_sql")" \
  || fail "could not atomically claim a PostgreSQL operation request"
if [ -z "$claim" ]; then
  [ -z "$approved_password_request" ] || fail "the explicitly approved password request is not pending"
  exit 0
fi
case "$claim" in *$'\n'*) fail "the claim returned more than one request" ;; esac
request_key="${claim%%|*}"
encoded_payload="${claim#*|}"
[ "$request_key" != "$claim" ] || fail "the claimed request payload is malformed"
[[ "$request_key" =~ ^postgresqlOperationRequest:[A-Za-z0-9_-]{1,128}$ ]] \
  || fail "the claimed request key is outside the governed prefix"
active_request_key="$request_key"

if ! request_fields="$(validate_request "$encoded_payload" "$request_key")"; then
  mark_invalid_request "$request_key" || fail "the invalid request could not be sealed"
  fail "the claimed request failed validation"
fi
mapfile -t request_parts <<<"$request_fields"
[ "${#request_parts[@]}" -eq 6 ] || {
  mark_invalid_request "$request_key" || true
  fail "the claimed request fields are malformed"
}
operation="${request_parts[0]}"
setting_key="${request_parts[1]}"
setting_value="${request_parts[2]}"
expected_current_value_ms="${request_parts[3]}"
request_id="${request_parts[4]}"
request_signature="${request_parts[5]}"
active_operation="$operation"
active_request_id="$request_id"
active_request_signature="$request_signature"

if replay_claimed_receipt; then
  printf '[workspace-sql-settings] replayed receipt for request %s\n' "$request_key"
  exit 0
fi

case "$operation" in
  set-runtime-setting)
    if ! target_value_ms="$(runtime_setting_value_ms "$setting_key" "$setting_value")"; then
      seal_operation_status "$request_key" "$request_id" "$request_signature" "$operation" failed INVALID_SETTING \
        "The requested runtime setting is not allowed." \
        || fail "the invalid setting request could not be sealed"
      fail "the runtime setting request is outside the allowlist"
    fi
    if ! actual_current_value_ms="$(read_runtime_setting_ms "$setting_key")" \
      || [[ ! "$actual_current_value_ms" =~ ^[0-9]+$ ]]; then
      seal_operation_status "$request_key" "$request_id" "$request_signature" "$operation" failed SETTING_READ_FAILED \
        "The current runtime setting could not be read." \
        || fail "the unreadable setting request could not be sealed"
      fail "the current runtime setting could not be read"
    fi
    if [ "$actual_current_value_ms" != "$expected_current_value_ms" ]; then
      seal_operation_status "$request_key" "$request_id" "$request_signature" "$operation" failed STALE_SETTING \
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
      seal_operation_status "$request_key" "$request_id" "$request_signature" "$operation" failed SETTING_READ_FAILED \
        "The current timeout relation could not be read." \
        || fail "the unreadable timeout relation could not be sealed"
      fail "the timeout relation could not be read"
    fi
    effective_statement_timeout_ms="$current_statement_timeout_ms"
    effective_lock_timeout_ms="$current_lock_timeout_ms"
    [ "$setting_key" != statement_timeout ] || effective_statement_timeout_ms="$target_value_ms"
    [ "$setting_key" != lock_timeout ] || effective_lock_timeout_ms="$target_value_ms"
    if [ "$effective_lock_timeout_ms" -ge "$effective_statement_timeout_ms" ]; then
      seal_operation_status "$request_key" "$request_id" "$request_signature" "$operation" failed INVALID_TIMEOUT_RELATION \
        "lock_timeout must be lower than statement_timeout." \
        || fail "the invalid timeout relation could not be sealed"
      fail "lock_timeout must remain lower than statement_timeout"
    fi
    if ! apply_runtime_setting "$setting_key" "$setting_value"; then
      seal_operation_status "$request_key" "$request_id" "$request_signature" "$operation" failed SETTING_APPLY_FAILED \
        "PostgreSQL rejected the requested runtime setting." \
        || fail "the failed setting request could not be sealed"
      fail "the runtime setting request failed"
    fi
    if ! observed_value_ms="$(read_runtime_setting_ms "$setting_key")" \
      || [[ ! "$observed_value_ms" =~ ^[0-9]+$ ]] \
      || [ "$observed_value_ms" != "$target_value_ms" ]; then
      seal_operation_status "$request_key" "$request_id" "$request_signature" "$operation" failed SETTING_VERIFY_FAILED \
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
      seal_operation_status "$request_key" "$request_id" "$request_signature" "$operation" failed SETTING_VERIFY_FAILED \
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
      seal_operation_status "$request_key" "$request_id" "$request_signature" "$operation" \
        "$rotation_terminal_status" "$rotation_terminal_error" \
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

if [ "$operation" = rotate-runtime-password ]; then
  record_receipt "$request_id" "$request_signature" "$operation" succeeded "" \
    "PostgreSQL operation completed." \
    || fail "the successful password rotation receipt could not be sealed"
  rotation_terminal_status="succeeded"
  rotation_terminal_error=""
  rotation_phase="completed"
  write_rotation_journal succeeded completed \
    || fail "the successful password rotation journal could not be sealed"
  seal_operation_status "$request_key" "$request_id" "$request_signature" "$operation" succeeded "" \
    "PostgreSQL operation completed." \
    || fail "the completed password request could not be sealed"
  rotation_active=0
  rotation_role_changed=0
  rotation_secret_changed=0
  unset rotation_old_password
else
  seal_operation_status "$request_key" "$request_id" "$request_signature" "$operation" succeeded "" \
    "PostgreSQL operation completed." \
    || fail "the completed request could not be sealed"
fi
printf '[workspace-sql-settings] completed request %s\n' "$request_key"
