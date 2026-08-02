#!/usr/bin/env bash
# shellcheck disable=SC2029
set -uo pipefail

if ! PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" \
  || ! cd "$PROJECT_ROOT"; then
  echo "[错误] 无法进入 deploy-unit 项目根目录" >&2
  exit 1
fi
source "$PROJECT_ROOT/ops/release/deploy/unit-preflight.sh"
if ! unit_preflight_initialize; then
  echo "[错误] 无法初始化 Unit Deploy Preflight evidence" >&2
  exit 1
fi

preflight_failed=()
preflight_blocked=()
preflight_fail() { preflight_failed+=("$1"); }
preflight_block() { preflight_blocked+=("$1"); }

COMMAND="${1:-}"
UNIT_ID="${2:-}"
MODE="${3:-shadow}"
SERVER="${SERVER:-}"
REMOTE_DIR="${REMOTE_DIR:-}"
WORKSPACE_GATEWAY_NGINX_SITE="${WORKSPACE_GATEWAY_NGINX_SITE:-}"
WORKSPACE_MONOLITH_WECOM_PROCESS_NAME="${WORKSPACE_MONOLITH_WECOM_PROCESS_NAME:-${PM2_WECOM_BOT_NAME:-workspace-wecom-agent}}"
DEPLOY_STARTED_EPOCH_SECONDS="${DEPLOY_STARTED_EPOCH_SECONDS:-}"
if [ -z "$DEPLOY_STARTED_EPOCH_SECONDS" ] && ! DEPLOY_STARTED_EPOCH_SECONDS="$(date +%s)"; then
  preflight_fail "runtime.deploy-start-time"
fi
DEPLOY_PACKAGE_VERSION="${DEPLOY_PACKAGE_VERSION:-}"
if [ -z "$DEPLOY_PACKAGE_VERSION" ] \
  && ! DEPLOY_PACKAGE_VERSION="$(node -p "require('./package.json').version")"; then
  preflight_fail "runtime.package-version"
fi
DEPLOY_RELEASE_PROCESS_SECONDS="${DEPLOY_RELEASE_PROCESS_SECONDS:-}"
DEPLOY_RELEASE_ATTEMPT_COUNT="${DEPLOY_RELEASE_ATTEMPT_COUNT:-}"
DEPLOY_RELEASE_PROCESS_STARTED_AT="${DEPLOY_RELEASE_PROCESS_STARTED_AT:-}"
DEPLOY_CNB_STAGES_BASE64="${DEPLOY_CNB_STAGES_BASE64:-}"

if [ -f .cnb-release.json ]; then
  deploy_metadata_values=""
  if ! deploy_metadata_values="$(node ops/release-deploy-metadata.mjs lines .cnb-release.json)"; then
    preflight_fail "metadata.release"
  fi
  DEPLOY_STARTED_EPOCH_SECONDS="$(printf '%s\n' "$deploy_metadata_values" | sed -n '1p')"
  DEPLOY_RELEASE_PROCESS_SECONDS="$(printf '%s\n' "$deploy_metadata_values" | sed -n '2p')"
  DEPLOY_RELEASE_ATTEMPT_COUNT="$(printf '%s\n' "$deploy_metadata_values" | sed -n '3p')"
  DEPLOY_RELEASE_PROCESS_STARTED_AT="$(printf '%s\n' "$deploy_metadata_values" | sed -n '4p')"
fi
if [ -n "${RELEASE_TIMING_FILE:-}" ] && [ -f "$RELEASE_TIMING_FILE" ]; then
  if ! DEPLOY_CNB_STAGES_BASE64="$(node - "$RELEASE_TIMING_FILE" "${RELEASE_SOURCE_SHA:-}" <<'NODE'
const fs = require('node:fs');
const [file, releaseId] = process.argv.slice(2);
const stages = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean)
  .map((line) => JSON.parse(line))
  .filter((event) => event.releaseId === releaseId && event.scope === 'cnb')
  .map(({ scope, stage, status, durationMs }) => ({ scope, stage, status, durationMs }));
process.stdout.write(Buffer.from(JSON.stringify(stages)).toString('base64'));
NODE
  )"; then
    preflight_fail "metadata.release-timing"
  fi
fi

unit_id_valid=1
command_valid=1
remote_inputs_valid=1
if [[ ! "$UNIT_ID" =~ ^[a-z][a-z0-9-]*$ ]]; then
  preflight_fail "input.unit-id"
  unit_id_valid=0
fi
case "$COMMAND" in
  deploy)
    case "$MODE" in
      shadow|prepare|activate) ;;
      *) preflight_fail "input.deploy-mode"; command_valid=0 ;;
    esac
    if [ "${DEPLOY_UNIT_TRUSTED_BUILD:-0}" != "1" ]; then
      preflight_fail "input.trusted-build"
    fi
    ;;
  rollback) MODE=rollback ;;
  *) preflight_fail "input.command"; command_valid=0 ;;
esac

if [ "$MODE" = "prepare" ]; then
  [ -n "${DEPLOY_PROFILE_PREPARED_STATE_ROOT:-}" ] \
    && [ "${DEPLOY_PROFILE_PREPARED_STATE_ROOT#/}" != "$DEPLOY_PROFILE_PREPARED_STATE_ROOT" ] \
    || { preflight_fail "input.prepared-state-root"; command_valid=0; }
fi

[ -n "$SERVER" ] || { preflight_fail "input.SERVER"; remote_inputs_valid=0; }
[ -n "$REMOTE_DIR" ] && [ "${REMOTE_DIR#/}" != "$REMOTE_DIR" ] \
  || { preflight_fail "input.REMOTE_DIR"; remote_inputs_valid=0; }
for value in "$SERVER" "$REMOTE_DIR" "$WORKSPACE_GATEWAY_NGINX_SITE" "$WORKSPACE_MONOLITH_WECOM_PROCESS_NAME" "${DEPLOY_PROFILE_PREPARED_STATE_ROOT:-}"; do
  if [[ "$value" == *"'"* ]]; then
    preflight_fail "input.shell-safe-values"
    remote_inputs_valid=0
    break
  fi
done
[[ "$WORKSPACE_MONOLITH_WECOM_PROCESS_NAME" =~ ^[A-Za-z0-9._-]+$ ]] || {
  preflight_fail "input.pm2-process-name"
  remote_inputs_valid=0
}

TEMPORARY_KEY=""
SSH_KEY=""
if [ -n "${KEY:-}" ]; then
  if [ -f "$KEY" ]; then SSH_KEY=$KEY
  else preflight_fail "input.KEY"; remote_inputs_valid=0
  fi
elif [ -n "${KEY_CONTENT:-}" ]; then
  if TEMPORARY_KEY="$(mktemp)" \
    && printf '%s\n' "$KEY_CONTENT" > "$TEMPORARY_KEY" \
    && chmod 600 "$TEMPORARY_KEY"; then
    SSH_KEY=$TEMPORARY_KEY
  else
    preflight_fail "input.KEY_CONTENT"
    remote_inputs_valid=0
  fi
else
  preflight_fail "input.deploy-key"
  remote_inputs_valid=0
fi

SSH_CONTROL_DIRECTORY=""
SSH_CONTROL_PATH=""
SSH_OPTIONS=()
RSYNC_SSH=""
if [ -n "$SSH_KEY" ]; then
  if SSH_CONTROL_DIRECTORY="$(mktemp -d)"; then
    SSH_CONTROL_PATH="$SSH_CONTROL_DIRECTORY/master"
    SSH_OPTIONS=(
      -i "$SSH_KEY"
      -o BatchMode=yes
      -o ConnectTimeout=15
      -o ConnectionAttempts=1
      -o StrictHostKeyChecking=accept-new
      -o ControlMaster=auto
      -o ControlPersist=600
      -o "ControlPath=$SSH_CONTROL_PATH"
    )
    RSYNC_SSH="ssh -i $SSH_KEY -o BatchMode=yes -o ConnectTimeout=15 -o ConnectionAttempts=1 -o StrictHostKeyChecking=accept-new -o ControlMaster=auto -o ControlPersist=600 -o ControlPath=$SSH_CONTROL_PATH"
  else
    preflight_fail "runtime.ssh-control-directory"
    remote_inputs_valid=0
  fi
else
  preflight_block "transport.connect:input.deploy-key"
fi
DEPLOY_TOOL_BUNDLE_TMP=""
REMOTE_DEPLOY_LOCK_PID=""
REMOTE_DEPLOY_LOCK_TOKEN=""
REMOTE_DEPLOY_LOCK_HELD=0
SSH_MASTER_STARTED=0

release_remote_deploy_lock() {
  [ "$REMOTE_DEPLOY_LOCK_HELD" = "1" ] || return 0
  local release_file="$REMOTE_DIR/.workspace/deploy-lock.release-$REMOTE_DEPLOY_LOCK_TOKEN"
  ssh "${SSH_OPTIONS[@]}" "$SERVER" \
    "test \"\$(cat '$REMOTE_DIR/.workspace/deploy-lock.owner' 2>/dev/null)\" = '$REMOTE_DEPLOY_LOCK_TOKEN' && : > '$release_file'" \
    >/dev/null 2>&1 || true
  wait "$REMOTE_DEPLOY_LOCK_PID" >/dev/null 2>&1 || true
  REMOTE_DEPLOY_LOCK_HELD=0
  REMOTE_DEPLOY_LOCK_PID=""
}

acquire_remote_deploy_lock() {
  local owner_file="$REMOTE_DIR/.workspace/deploy-lock.owner"
  local lock_file="$REMOTE_DIR/.workspace/deploy.lock"
  local release_file
  local wait_status
  REMOTE_DEPLOY_LOCK_TOKEN="unit-${UNIT_ID}-${RELEASE_SOURCE_SHA:-rollback}-$$-$(date +%s)"
  release_file="$REMOTE_DIR/.workspace/deploy-lock.release-$REMOTE_DEPLOY_LOCK_TOKEN"
  ssh "${SSH_OPTIONS[@]}" "$SERVER" "
    set -o errexit
    test -d '$REMOTE_DIR/.workspace'
    command -v flock >/dev/null
    exec 9>>'$lock_file'
    if ! flock -n 9; then exit 73; fi
    printf '%s\n' '$REMOTE_DEPLOY_LOCK_TOKEN' > '$owner_file'
    trap \"rm -f '$owner_file' '$release_file'\" EXIT
    while [ ! -f '$release_file' ]; do sleep 1; done
  " &
  REMOTE_DEPLOY_LOCK_PID=$!
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    if ssh "${SSH_OPTIONS[@]}" "$SERVER" \
      "test \"\$(cat '$owner_file' 2>/dev/null)\" = '$REMOTE_DEPLOY_LOCK_TOKEN'" >/dev/null 2>&1; then
      REMOTE_DEPLOY_LOCK_HELD=1
      return 0
    fi
    if ! kill -0 "$REMOTE_DEPLOY_LOCK_PID" >/dev/null 2>&1; then
      wait_status=0
      wait "$REMOTE_DEPLOY_LOCK_PID" || wait_status=$?
      echo "[错误] 无法获取共享 production deploy.lock（remote status: $wait_status）" >&2
      return 1
    fi
    sleep 1
  done
  kill "$REMOTE_DEPLOY_LOCK_PID" >/dev/null 2>&1 || true
  wait "$REMOTE_DEPLOY_LOCK_PID" >/dev/null 2>&1 || true
  echo "[错误] 获取共享 production deploy.lock 超时" >&2
  return 1
}

capture_unit_production_snapshot() {
  local output_file="$1" snapshot_values
  snapshot_values="$(ssh "${SSH_OPTIONS[@]}" "$SERVER" "
    snapshot_status=0
    hash_file() {
      label=\"\$1\"
      file=\"\$2\"
      if [ -f \"\$file\" ]; then
        digest=\$(sha256sum \"\$file\") || { echo \"snapshot digest failed: \$label\" >&2; return 1; }
        printf '%s=%s\\n' \"\$label\" \"\${digest%% *}\"
      else
        digest=\$(printf '%s' \"missing:\$label\" | sha256sum) || return 1
        printf '%s=%s\\n' \"\$label\" \"\${digest%% *}\"
      fi
    }
    command -v sha256sum >/dev/null 2>&1 || { echo 'remote sha256sum is unavailable' >&2; exit 1; }
    current_target=\$(readlink '$REMOTE_DIR/current' 2>/dev/null)
    [ -n \"\$current_target\" ] || current_target=missing:current
    current_digest=\$(printf '%s' \"symlink:\$current_target\" | sha256sum) || exit 1
    printf 'current-target=%s\\n' \"\${current_digest%% *}\"
    hash_file deployed-receipt '$REMOTE_DIR/.workspace/deployed-release.json' || snapshot_status=1
    hash_file tenant-manifest '$REMOTE_DIR/.workspace/.deployment/tenant-config-manifest.json' || snapshot_status=1
    hash_file gateway-manifest '$REMOTE_DIR/.workspace/gateway/current/manifest.json' || snapshot_status=1
    hash_file unit-state '$REMOTE_DIR/.workspace/gateway/current/unit-states/$UNIT_ID.json' || snapshot_status=1
    exit \"\$snapshot_status\"
  ")" || return 1
  unit_preflight_write_snapshot "$UNIT_ID" "$output_file" "$snapshot_values" || return 1
  node "$PROJECT_ROOT/ops/release/deploy/unit-preflight.mjs" snapshot-compare \
    --expected "$output_file" --actual "$output_file"
}

cleanup() {
  local exit_code=$?
  release_remote_deploy_lock
  if [ "$SSH_MASTER_STARTED" = 1 ]; then
    ssh "${SSH_OPTIONS[@]}" -O exit "$SERVER" >/dev/null 2>&1 || true
  fi
  if [ -n "$SSH_CONTROL_DIRECTORY" ]; then rm -rf "$SSH_CONTROL_DIRECTORY"; fi
  if [ -n "$TEMPORARY_KEY" ]; then rm -f "$TEMPORARY_KEY"; fi
  if [ -n "$DEPLOY_TOOL_BUNDLE_TMP" ]; then
    rm -rf "$DEPLOY_TOOL_BUNDLE_TMP"
  fi
  exit "$exit_code"
}
trap cleanup EXIT

REMOTE_TOOL_ROOT="$REMOTE_DIR/.workspace/runtime/deploy-unit-tools"
transport_ready=0
if [ "$remote_inputs_valid" = 1 ] && [ -n "$SSH_CONTROL_DIRECTORY" ]; then
  if ssh "${SSH_OPTIONS[@]}" -fN "$SERVER"; then
    SSH_MASTER_STARTED=1
    transport_ready=1
  else
    preflight_fail "transport.connect"
  fi
else
  preflight_block "transport.connect:input"
fi

bundle_ready=0
if DEPLOY_TOOL_BUNDLE_TMP="$(mktemp -d "${TMPDIR:-/tmp}/workspace-deploy-unit-tools.XXXXXX")"; then
  if node ops/release/control/deploy-tool-bundle.mjs build \
    --repository "$PROJECT_ROOT" \
    --output "$DEPLOY_TOOL_BUNDLE_TMP" \
    --profile deploy-unit-tools >/dev/null; then
    bundle_ready=1
  else
    preflight_fail "deploy-tool-bundle.build"
  fi
else
  preflight_fail "deploy-tool-bundle.temporary-directory"
fi
if [ "$bundle_ready" = 1 ]; then
  if ! node ops/release/control/deploy-tool-bundle.mjs verify \
    --bundle "$DEPLOY_TOOL_BUNDLE_TMP" >/dev/null; then
    preflight_fail "deploy-tool-bundle.verify"
  fi
else
  preflight_block "deploy-tool-bundle.verify:deploy-tool-bundle.build"
fi

OUTPUT_ROOT=""
ARTIFACT_FILE=""
MANIFEST_FILE=""
CONTRACT_FILE=""
GRAPH_FILE=""
if [ "$COMMAND" = "deploy" ]; then
  OUTPUT_ROOT="${DEPLOY_UNIT_OUTPUT_ROOT:-.cache/deploy-units/$UNIT_ID}"
  ARTIFACT_FILE="${DEPLOY_UNIT_ARTIFACT_PATH:-$OUTPUT_ROOT/$UNIT_ID-standalone.tgz}"
  MANIFEST_FILE="${DEPLOY_UNIT_MANIFEST_PATH:-$OUTPUT_ROOT/$UNIT_ID-standalone.manifest.json}"
  CONTRACT_FILE="$OUTPUT_ROOT/deploy-unit-contract.json"
  GRAPH_FILE="$OUTPUT_ROOT/deploy-graph.json"
  missing_outputs=0
  for file in "$ARTIFACT_FILE" "$MANIFEST_FILE" "$CONTRACT_FILE" "$GRAPH_FILE"; do
    if [ ! -f "$file" ]; then
      preflight_fail "artifact.output:$file"
      missing_outputs=1
    fi
  done
  if [ "$missing_outputs" = 0 ]; then
    if ! node ops/deploy-unit-release.mjs artifact-assert \
      --artifact "$ARTIFACT_FILE" --manifest "$MANIFEST_FILE" --contract "$CONTRACT_FILE" >/dev/null; then
      preflight_fail "artifact.assert"
    fi
  else
    preflight_block "artifact.assert:artifact.output"
  fi
  GRAPH_DIGEST=""
  if [ -f "$MANIFEST_FILE" ]; then
    if ! GRAPH_DIGEST="$(node -e 'const m=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")); process.stdout.write(m.unit.graphSha256)' "$MANIFEST_FILE")"; then
      preflight_fail "gateway.graph-digest"
    fi
  else
    preflight_block "gateway.graph-digest:artifact.manifest"
  fi
  if [ -n "$GRAPH_DIGEST" ] && [ -f "$GRAPH_FILE" ]; then
    if ! node ops/gateway-generation.mjs graph-assert --graph "$GRAPH_FILE" --digest "$GRAPH_DIGEST" >/dev/null; then
      preflight_fail "gateway.graph-assert"
    fi
  else
    preflight_block "gateway.graph-assert:gateway.graph-digest"
  fi
fi

if [ -z "${OPS_ENV_FILE:-}" ] || [ ! -f "$OPS_ENV_FILE" ]; then
  preflight_fail "input.OPS_ENV_FILE"
fi
if [[ ! "${RELEASE_SOURCE_SHA:-}" =~ ^[0-9a-f]{40}$ ]]; then
  preflight_fail "input.RELEASE_SOURCE_SHA"
fi
if [ -n "${OPS_ENV_FILE:-}" ] && [ -f "$OPS_ENV_FILE" ] \
  && [[ "${RELEASE_SOURCE_SHA:-}" =~ ^[0-9a-f]{40}$ ]]; then
  if ! OPS_ENV_FILE="$OPS_ENV_FILE" ./ops/sync-tenant-config.sh --dry-run --source-sha "$RELEASE_SOURCE_SHA"; then
    preflight_fail "tenant-config.dry-run"
  fi
else
  preflight_block "tenant-config.dry-run:input"
fi

if [ "$transport_ready" = 1 ]; then
  remote_contract_ready=0
  if ssh "${SSH_OPTIONS[@]}" "$SERVER" "
    remote_status=0
    test -d '$REMOTE_DIR' || { echo '[错误] REMOTE_DIR 不存在' >&2; remote_status=1; }
    test -d '$REMOTE_DIR/.workspace' || { echo '[错误] .workspace 不存在' >&2; remote_status=1; }
    command -v flock >/dev/null 2>&1 || { echo '[错误] flock 不可用' >&2; remote_status=1; }
    command -v sha256sum >/dev/null 2>&1 || { echo '[错误] sha256sum 不可用' >&2; remote_status=1; }
    command -v node >/dev/null 2>&1 || { echo '[错误] node 不可用' >&2; remote_status=1; }
    exit \"\$remote_status\"
  "; then
    remote_contract_ready=1
  else
    preflight_fail "runtime.remote-contract"
  fi
  if [ "$remote_contract_ready" = 1 ]; then
    if ! capture_unit_production_snapshot "$DEPLOY_PREFLIGHT_SNAPSHOT_FILE"; then
      preflight_fail "production.semantic-snapshot"
    fi
  else
    preflight_block "production.semantic-snapshot:runtime.remote-contract"
  fi
else
  preflight_block "runtime.remote-contract:transport.connect"
  preflight_block "production.semantic-snapshot:transport.connect"
fi

if ! unit_preflight_finalize_evidence; then
  echo "[错误] Unit Deploy Preflight attempt 无法签发；production mutation=0" >&2
  exit 1
fi

if [ "${#preflight_failed[@]}" -gt 0 ] || [ "${#preflight_blocked[@]}" -gt 0 ]; then
  echo "[错误] Unit Deploy Preflight 汇总: failed=${#preflight_failed[@]} blocked=${#preflight_blocked[@]}; production mutation=0" >&2
  for item in "${preflight_failed[@]}"; do echo "  failed: $item" >&2; done
  for item in "${preflight_blocked[@]}"; do echo "  blocked: $item" >&2; done
  exit 1
fi
if ! unit_preflight_verify_ready; then
  echo "[错误] Unit Deploy Preflight Ready 锁前复验失败；production mutation=0" >&2
  exit 1
fi

if ! acquire_remote_deploy_lock; then
  echo "[错误] Unit deploy 未获取 shared deploy.lock；production mutation=0" >&2
  exit 1
fi
if ! capture_unit_production_snapshot "$DEPLOY_PREFLIGHT_LOCKED_SNAPSHOT_FILE"; then
  echo "[错误] Unit deploy 锁内 production semantic snapshot 复验失败；production mutation=0" >&2
  exit 1
fi
if ! node "$PROJECT_ROOT/ops/release/deploy/unit-preflight.mjs" snapshot-compare \
  --expected "$DEPLOY_PREFLIGHT_SNAPSHOT_FILE" --actual "$DEPLOY_PREFLIGHT_LOCKED_SNAPSHOT_FILE"; then
  echo "[错误] Unit deploy 获取锁期间 production semantic snapshot 漂移；production mutation=0" >&2
  exit 1
fi
# workspace-errexit-role: mutation-barrier
set -e

OPS_ENV_FILE="${OPS_ENV_FILE:?OPS_ENV_FILE is required}" \
  ./ops/sync-tenant-config.sh --source-sha "${RELEASE_SOURCE_SHA:?RELEASE_SOURCE_SHA is required}" \
    --lock-token "$REMOTE_DEPLOY_LOCK_TOKEN"
ssh "${SSH_OPTIONS[@]}" "$SERVER" "mkdir -p '$REMOTE_TOOL_ROOT'"
rsync -az --delete-delay -e "$RSYNC_SSH" \
  "$DEPLOY_TOOL_BUNDLE_TMP/" "$SERVER:$REMOTE_TOOL_ROOT/"
ssh "${SSH_OPTIONS[@]}" "$SERVER" \
  "node '$REMOTE_TOOL_ROOT/release/control/deploy-tool-bundle.mjs' verify --bundle '$REMOTE_TOOL_ROOT' >/dev/null"
rm -rf "$DEPLOY_TOOL_BUNDLE_TMP"
DEPLOY_TOOL_BUNDLE_TMP=""

if [ "$COMMAND" = "rollback" ]; then
  ssh "${SSH_OPTIONS[@]}" "$SERVER" \
    "DEPLOY_LOCK_TOKEN='$REMOTE_DEPLOY_LOCK_TOKEN' REMOTE_DIR='$REMOTE_DIR' WORKSPACE_GATEWAY_NGINX_SITE='$WORKSPACE_GATEWAY_NGINX_SITE' WORKSPACE_MONOLITH_WECOM_PROCESS_NAME='$WORKSPACE_MONOLITH_WECOM_PROCESS_NAME' DEPLOY_PACKAGE_VERSION='$DEPLOY_PACKAGE_VERSION' DEPLOY_STARTED_EPOCH_SECONDS='$DEPLOY_STARTED_EPOCH_SECONDS' '$REMOTE_TOOL_ROOT/apply-deploy-unit.sh' rollback '$UNIT_ID'"
  exit 0
fi

MANIFEST_DIGEST="$(node -e 'const c=require("node:crypto"),f=require("node:fs"); process.stdout.write(c.createHash("sha256").update(f.readFileSync(process.argv[1])).digest("hex"))' "$MANIFEST_FILE")"
REMOTE_STAGING="$REMOTE_DIR/.workspace/deploy-unit-staging/$UNIT_ID-${MANIFEST_DIGEST:0:16}"
ssh "${SSH_OPTIONS[@]}" "$SERVER" "mkdir -p '$REMOTE_STAGING' && chmod 700 '$REMOTE_STAGING'"
rsync -az -e "$RSYNC_SSH" "$ARTIFACT_FILE" "$SERVER:$REMOTE_STAGING/artifact.tgz"
rsync -az -e "$RSYNC_SSH" "$MANIFEST_FILE" "$SERVER:$REMOTE_STAGING/artifact.manifest.json"
rsync -az -e "$RSYNC_SSH" "$CONTRACT_FILE" "$SERVER:$REMOTE_STAGING/deploy-unit-contract.json"
rsync -az -e "$RSYNC_SSH" "$GRAPH_FILE" "$SERVER:$REMOTE_STAGING/deploy-graph.json"
ssh "${SSH_OPTIONS[@]}" "$SERVER" \
  "DEPLOY_LOCK_TOKEN='$REMOTE_DEPLOY_LOCK_TOKEN' REMOTE_DIR='$REMOTE_DIR' WORKSPACE_GATEWAY_NGINX_SITE='$WORKSPACE_GATEWAY_NGINX_SITE' WORKSPACE_MONOLITH_WECOM_PROCESS_NAME='$WORKSPACE_MONOLITH_WECOM_PROCESS_NAME' DEPLOY_PROFILE_PREPARED_STATE_ROOT='${DEPLOY_PROFILE_PREPARED_STATE_ROOT:-}' DEPLOY_PACKAGE_VERSION='$DEPLOY_PACKAGE_VERSION' DEPLOY_STARTED_EPOCH_SECONDS='$DEPLOY_STARTED_EPOCH_SECONDS' DEPLOY_RELEASE_PROCESS_SECONDS='$DEPLOY_RELEASE_PROCESS_SECONDS' DEPLOY_RELEASE_ATTEMPT_COUNT='$DEPLOY_RELEASE_ATTEMPT_COUNT' DEPLOY_RELEASE_PROCESS_STARTED_AT='$DEPLOY_RELEASE_PROCESS_STARTED_AT' DEPLOY_CNB_STAGES_BASE64='$DEPLOY_CNB_STAGES_BASE64' '$REMOTE_TOOL_ROOT/apply-deploy-unit.sh' deploy '$UNIT_ID' '$REMOTE_STAGING' '$MODE'"
ssh "${SSH_OPTIONS[@]}" "$SERVER" "rm -rf '$REMOTE_STAGING'"
