#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMAND="${1:-}"
UNIT_ID="${2:-}"
STAGING_DIR="${3:-}"
MODE="${4:-shadow}"
REMOTE_DIR="${REMOTE_DIR:-}"
PREPARED_STATE_ROOT="${DEPLOY_PROFILE_PREPARED_STATE_ROOT:-}"
DEPLOY_EVENT_FILE="${DEPLOY_EVENT_FILE:-$HOME/.finance-bot-deploy-event.json}"
DEPLOY_PACKAGE_VERSION="${DEPLOY_PACKAGE_VERSION:-unknown}"
DEPLOY_STARTED_EPOCH_SECONDS="${DEPLOY_STARTED_EPOCH_SECONDS:-$(date +%s)}"
DEPLOY_RELEASE_PROCESS_SECONDS="${DEPLOY_RELEASE_PROCESS_SECONDS:-}"
DEPLOY_RELEASE_ATTEMPT_COUNT="${DEPLOY_RELEASE_ATTEMPT_COUNT:-}"
DEPLOY_RELEASE_PROCESS_STARTED_AT="${DEPLOY_RELEASE_PROCESS_STARTED_AT:-}"
DEPLOY_CNB_STAGES_BASE64="${DEPLOY_CNB_STAGES_BASE64:-}"

if [[ ! "$UNIT_ID" =~ ^[a-z][a-z0-9-]*$ ]]; then
  echo "[错误] deploy unit id 无效" >&2
  exit 2
fi
if [ -z "$REMOTE_DIR" ] || [ "${REMOTE_DIR#/}" = "$REMOTE_DIR" ]; then
  echo "[错误] REMOTE_DIR 必须是绝对路径" >&2
  exit 1
fi
case "$COMMAND" in
  deploy)
    case "$MODE" in shadow|prepare|activate) ;; *) echo "[错误] deploy mode 必须是 shadow、prepare 或 activate" >&2; exit 2 ;; esac
    [ -n "$STAGING_DIR" ] && [ "${STAGING_DIR#/}" != "$STAGING_DIR" ] || {
      echo "[错误] deploy staging dir 必须是绝对路径" >&2
      exit 2
    }
    if [ "$MODE" = "prepare" ]; then
      [ -n "$PREPARED_STATE_ROOT" ] && [ "${PREPARED_STATE_ROOT#/}" != "$PREPARED_STATE_ROOT" ] || {
        echo "[错误] prepare mode 需要绝对路径 DEPLOY_PROFILE_PREPARED_STATE_ROOT" >&2
        exit 2
      }
    fi
    ;;
  rollback) ;;
  *) echo "用法: $0 deploy <unit> <staging-dir> <shadow|prepare|activate> | rollback <unit>" >&2; exit 2 ;;
esac

CONFIG_ROOT="$REMOTE_DIR/.workspace"
CONTROL_PLANE_RECEIPT="$CONFIG_ROOT/control-plane-release.json"
TENANT_MANIFEST="$CONFIG_ROOT/.deployment/tenant-config-manifest.json"
INTERNAL_IDENTITY_ROOT="$CONFIG_ROOT/internal-unit-identities"
INTERNAL_SIGNING_PRIVATE_KEY_FILE="$INTERNAL_IDENTITY_ROOT/private/$UNIT_ID.pem"
INTERNAL_TRUSTED_PUBLIC_KEYS_FILE="$INTERNAL_IDENTITY_ROOT/trusted-public-keys.json"
INTERNAL_REPLAY_DIRECTORY="$INTERNAL_IDENTITY_ROOT/replay/$UNIT_ID"
GATEWAY_ROOT="$CONFIG_ROOT/gateway"
UNIT_ROOT="$REMOTE_DIR/deploy-units/$UNIT_ID"
RELEASE_ROOT="$UNIT_ROOT/releases"
RECEIPT_ROOT="$UNIT_ROOT/receipts"
CURRENT_GATEWAY="$GATEWAY_ROOT/current"
CURRENT_STATE_ROOT="$CURRENT_GATEWAY/unit-states"
CURRENT_STATE_FILE="$CURRENT_STATE_ROOT/$UNIT_ID.json"
EMPTY_STATE_ROOT="$UNIT_ROOT/empty-states"
LOCK_FILE="$CONFIG_ROOT/deploy.lock"

mkdir -p "$CONFIG_ROOT" "$RELEASE_ROOT" "$RECEIPT_ROOT" "$EMPTY_STATE_ROOT"
chmod 700 "$CONFIG_ROOT" "$UNIT_ROOT" "$RELEASE_ROOT" "$RECEIPT_ROOT" "$EMPTY_STATE_ROOT"
if [ "$MODE" = "prepare" ]; then
  mkdir -p "$PREPARED_STATE_ROOT"
  chmod 700 "$PREPARED_STATE_ROOT"
fi
command -v flock >/dev/null
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[错误] 另一生产部署正在 backup→switch 临界区运行" >&2
  exit 73
fi

STARTED_PROCESS=""
STARTED_SIDECAR=""
GATEWAY_COMMITTED=0
cleanup_candidate() {
  local exit_code=$?
  if [ "$exit_code" -ne 0 ] && [ "$GATEWAY_COMMITTED" = "0" ]; then
    [ -z "$STARTED_SIDECAR" ] || pm2 delete "$STARTED_SIDECAR" >/dev/null 2>&1 || true
    [ -z "$STARTED_PROCESS" ] || pm2 delete "$STARTED_PROCESS" >/dev/null 2>&1 || true
    pm2 save >/dev/null 2>&1 || true
  fi
  exit "$exit_code"
}
trap cleanup_candidate EXIT

read_json_field() {
  # shellcheck disable=SC2016
  node -e '
const fs = require("node:fs");
const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
let current = value;
for (const segment of process.argv[2].split(".")) current = current?.[segment];
if (typeof current !== "string" && typeof current !== "number") throw new Error(`field ${process.argv[2]} is missing`);
process.stdout.write(String(current));
' "$1" "$2"
}

deploy_duration_seconds() {
  case "$DEPLOY_STARTED_EPOCH_SECONDS" in
    ''|*[!0-9]*) echo "[错误] 模块部署开始时间无效" >&2; return 1 ;;
  esac
  local duration="$(($(date +%s) - DEPLOY_STARTED_EPOCH_SECONDS))"
  [ "$duration" -ge 0 ] || { echo "[错误] 模块部署开始时间晚于完成时间" >&2; return 1; }
  printf '%s' "$duration"
}

write_unit_deploy_event() {
  local action=$1
  local manifest_file=$2
  local contract_file=$3
  local release_id=$4
  local generation_id=$5
  local deployment_mode=$6
  local notification_args=(unit-write \
    --contract "$contract_file" \
    --manifest "$manifest_file" \
    --action "$action" \
    --deployment-mode "$deployment_mode" \
    --release-id "$release_id" \
    --package-version "$DEPLOY_PACKAGE_VERSION" \
    --duration-seconds "$(deploy_duration_seconds)" \
    --history-dir "$CONFIG_ROOT/deployment-history" \
    --event-file "$DEPLOY_EVENT_FILE")
  if [ -n "$DEPLOY_RELEASE_PROCESS_SECONDS" ]; then
    notification_args+=(
      --release-process-seconds "$DEPLOY_RELEASE_PROCESS_SECONDS"
      --release-attempt-count "$DEPLOY_RELEASE_ATTEMPT_COUNT"
      --release-process-started-at "$DEPLOY_RELEASE_PROCESS_STARTED_AT"
    )
    [ -z "$DEPLOY_CNB_STAGES_BASE64" ] || notification_args+=(--stages-base64 "$DEPLOY_CNB_STAGES_BASE64")
  fi
  [ -z "$generation_id" ] || notification_args+=(--gateway-generation "$generation_id")
  node "$SCRIPT_DIR/deploy-notification.mjs" "${notification_args[@]}"
}

load_runtime_environment() {
  if [ -f "$CONFIG_ROOT/.env" ]; then
    set +u
    set -a
    # shellcheck source=/dev/null
    source "$CONFIG_ROOT/.env"
    set +a
    set -u
  fi
}

wait_for_runtime() {
  local manifest_file=$1
  local port=$2
  local deployment_id=$3
  local base_path health_path version_path version_file
  base_path="$(read_json_field "$manifest_file" build.basePath)"
  health_path="$(read_json_field "$manifest_file" runtime.healthPath)"
  version_path="$(read_json_field "$manifest_file" runtime.versionPath)"
  version_file="$(mktemp)"
  for _ in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:$port$base_path$health_path" >/dev/null \
      && curl -fsS "http://127.0.0.1:$port$base_path$version_path" > "$version_file" \
      && EXPECTED_VERSION="$deployment_id" VERSION_FILE="$version_file" node - <<'NODE'
const fs = require("node:fs");
const payload = JSON.parse(fs.readFileSync(process.env.VERSION_FILE, "utf8"));
if (payload?.version !== process.env.EXPECTED_VERSION) process.exit(1);
NODE
    then
      rm -f "$version_file"
      return
    fi
    sleep 2
  done
  rm -f "$version_file"
  echo "[错误] $UNIT_ID $deployment_id 在端口 $port 未通过 health/version" >&2
  return 1
}

start_release() {
  local manifest_file=$1
  local release_dir=$2
  local slot=$3
  local server_entry process_name port deployment_id app_dir memory_mib database_pool_max
  server_entry="$(read_json_field "$manifest_file" build.serverEntry)"
  process_name="$(read_json_field "$manifest_file" runtime.processName)-$slot"
  port="$(read_json_field "$manifest_file" "runtime.slots.${slot}.port")"
  deployment_id="$(read_json_field "$manifest_file" build.deploymentId)"
  memory_mib="$(read_json_field "$manifest_file" runtime.capacity.memoryMiB)"
  database_pool_max="$(read_json_field "$manifest_file" runtime.capacity.databasePoolMax)"
  [ -f "$release_dir/$server_entry" ] || { echo "[错误] server entry 不存在: $release_dir/$server_entry" >&2; exit 1; }
  app_dir="$(dirname "$release_dir/$server_entry")"
  node "$SCRIPT_DIR/internal-unit-identity.mjs" ensure \
    --root "$INTERNAL_IDENTITY_ROOT" \
    --unit "$UNIT_ID" >/dev/null
  pm2 delete "$process_name" >/dev/null 2>&1 || true
  load_runtime_environment
  PORT="$port" HOSTNAME=127.0.0.1 BUILD_VERSION="$deployment_id" NEXT_PUBLIC_BUILD_VERSION="$deployment_id" \
    WORKSPACE_INTERNAL_ORIGIN="${WORKSPACE_INTERNAL_ORIGIN:-http://127.0.0.1}" \
    WORKSPACE_DEPLOY_UNIT_ID="$UNIT_ID" \
    WORKSPACE_INTERNAL_SIGNING_PRIVATE_KEY_FILE="$INTERNAL_SIGNING_PRIVATE_KEY_FILE" \
    WORKSPACE_INTERNAL_TRUSTED_PUBLIC_KEYS_FILE="$INTERNAL_TRUSTED_PUBLIC_KEYS_FILE" \
    WORKSPACE_INTERNAL_REPLAY_DIRECTORY="$INTERNAL_REPLAY_DIRECTORY" \
    PG_POOL_MAX="$database_pool_max" PG_APPLICATION_NAME="workspace-$UNIT_ID-$slot" \
    pm2 start "$release_dir/$server_entry" --name "$process_name" --cwd "$app_dir" \
      --max-memory-restart "${memory_mib}M" --update-env
  STARTED_PROCESS="$process_name"
  wait_for_runtime "$manifest_file" "$port" "$deployment_id"
}

wait_for_pm2_online() {
  local process_name=$1
  for _ in $(seq 1 15); do
    if pm2 jlist | PM2_PROCESS_NAME="$process_name" node -e '
const fs = require("node:fs");
const processes = JSON.parse(fs.readFileSync(0, "utf8"));
const match = processes.find((item) => item?.name === process.env.PM2_PROCESS_NAME);
if (match?.pm2_env?.status !== "online") process.exit(1);
'; then
      return
    fi
    sleep 1
  done
  echo "[错误] Assistant sidecar 未进入 online: $process_name" >&2
  return 1
}

start_release_sidecars() {
  local manifest_file=$1
  local release_dir=$2
  local slot=$3
  [ "$UNIT_ID" = "assistant" ] || return 0
  local descriptor="$release_dir/.assistant-runtime.json"
  [ -f "$descriptor" ] || { echo "[错误] Assistant runtime descriptor 不存在" >&2; return 1; }
  load_runtime_environment
  node "$SCRIPT_DIR/assistant-runtime.mjs" env-assert --release-root "$release_dir"
  local sidecar_name entry memory_mib bridge_path base_path port process_name
  sidecar_name="$(read_json_field "$descriptor" sidecars.0.processName)"
  entry="$(read_json_field "$descriptor" sidecars.0.entry)"
  memory_mib="$(read_json_field "$descriptor" sidecars.0.memoryMiB)"
  bridge_path="$(read_json_field "$descriptor" sidecars.0.bridgePath)"
  base_path="$(read_json_field "$manifest_file" build.basePath)"
  port="$(read_json_field "$manifest_file" "runtime.slots.${slot}.port")"
  process_name="$sidecar_name-$slot"
  pm2 delete "$process_name" >/dev/null 2>&1 || true
  PORT="$port" NEXT_PUBLIC_BASE_PATH="$base_path" WORKSPACE_CONFIG_DIR="$CONFIG_ROOT" \
    WORKSPACE_DEPLOY_UNIT_ID="$UNIT_ID" \
    WORKSPACE_INTERNAL_SIGNING_PRIVATE_KEY_FILE="$INTERNAL_SIGNING_PRIVATE_KEY_FILE" \
    WORKSPACE_INTERNAL_TRUSTED_PUBLIC_KEYS_FILE="$INTERNAL_TRUSTED_PUBLIC_KEYS_FILE" \
    WORKSPACE_INTERNAL_REPLAY_DIRECTORY="$INTERNAL_REPLAY_DIRECTORY" \
    WECHAT_BOT_BRIDGE_URL="http://127.0.0.1:$port$base_path$bridge_path" \
    pm2 start "$release_dir/$entry" --name "$process_name" --cwd "$release_dir" \
      --max-memory-restart "${memory_mib}M" --update-env
  STARTED_SIDECAR="$process_name"
  wait_for_pm2_online "$process_name"
}

stop_release_sidecars() {
  local release_dir=$1
  local slot=$2
  [ "$UNIT_ID" = "assistant" ] || return 0
  local descriptor="$release_dir/.assistant-runtime.json"
  [ -f "$descriptor" ] || return 0
  pm2 delete "$(read_json_field "$descriptor" sidecars.0.processName)-$slot" >/dev/null 2>&1 || true
}

safe_extract_artifact() {
  local artifact=$1
  local target=$2
  ARTIFACT="$artifact" TARGET="$target" python3 - <<'PY'
import os
from pathlib import Path
import tarfile

artifact = Path(os.environ["ARTIFACT"])
target = Path(os.environ["TARGET"])
root = target.resolve()
with tarfile.open(artifact, "r:gz") as archive:
    for member in archive.getmembers():
        destination = (root / member.name).resolve()
        if destination != root and root not in destination.parents:
            raise SystemExit(f"artifact entry escapes release root: {member.name}")
        if member.issym() or member.islnk():
            link = (destination.parent / member.linkname).resolve()
            if link != root and root not in link.parents:
                raise SystemExit(f"artifact link escapes release root: {member.name}")
    archive.extractall(target)
PY
}

assert_graph_matches_manifest() {
  local graph_file=$1
  local manifest_file=$2
  local graph_digest
  graph_digest="$(read_json_field "$manifest_file" unit.graphSha256)"
  node "$SCRIPT_DIR/gateway-generation.mjs" graph-assert --graph "$graph_file" --digest "$graph_digest" >/dev/null
}

create_gateway_generation() {
  local graph_file=$1
  local proposed_state=$2
  local state_root=$CURRENT_STATE_ROOT
  [ -d "$state_root" ] || state_root=$EMPTY_STATE_ROOT
  node "$SCRIPT_DIR/gateway-generation.mjs" create \
    --graph "$graph_file" \
    --state-root "$state_root" \
    --state "$UNIT_ID=$proposed_state" \
    --output-root "$GATEWAY_ROOT" \
    --generated-at "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
}

switch_gateway() {
  local generation_id=$1
  WORKSPACE_GATEWAY_ROOT="$GATEWAY_ROOT" \
    WORKSPACE_GATEWAY_NGINX_SITE="${WORKSPACE_GATEWAY_NGINX_SITE:-}" \
    "$SCRIPT_DIR/switch-deploy-gateway.sh" --generation "$GATEWAY_ROOT/generations/$generation_id"
  GATEWAY_COMMITTED=1
}

deploy_unit() {
  local artifact="$STAGING_DIR/artifact.tgz"
  local manifest="$STAGING_DIR/artifact.manifest.json"
  local contract="$STAGING_DIR/deploy-unit-contract.json"
  local graph="$STAGING_DIR/deploy-graph.json"
  for file in "$artifact" "$manifest" "$contract" "$graph" "$CONTROL_PLANE_RECEIPT" "$TENANT_MANIFEST"; do
    [ -f "$file" ] || { echo "[错误] 缺少 deploy unit 输入: $file" >&2; exit 1; }
  done
  node "$SCRIPT_DIR/deploy-unit-release.mjs" artifact-assert \
    --artifact "$artifact" --manifest "$manifest" --contract "$contract" >/dev/null
  node "$SCRIPT_DIR/deploy-unit-release.mjs" control-plane-assert \
    --manifest "$manifest" --control-plane-receipt "$CONTROL_PLANE_RECEIPT" --tenant-manifest "$TENANT_MANIFEST" >/dev/null
  assert_graph_matches_manifest "$graph" "$manifest"

  UNIT_ID_EXPECTED="$UNIT_ID" MODE_EXPECTED="$MODE" CONTRACT_FILE="$contract" GRAPH_FILE="$graph" node - <<'NODE'
const fs = require("node:fs");
const contract = JSON.parse(fs.readFileSync(process.env.CONTRACT_FILE, "utf8"));
const graph = JSON.parse(fs.readFileSync(process.env.GRAPH_FILE, "utf8"));
const unit = graph.units.find((candidate) => candidate.id === process.env.UNIT_ID_EXPECTED);
if (contract.id !== process.env.UNIT_ID_EXPECTED || !unit) throw new Error("deploy unit identity is inconsistent");
if (contract.runtime.engine !== "next-standalone") throw new Error("apply-deploy-unit supports only next-standalone runtimes");
if ((process.env.MODE_EXPECTED === "activate" || process.env.MODE_EXPECTED === "prepare") && unit.maturity !== "active") {
  throw new Error(`${unit.id} is not active in the deploy graph`);
}
if (process.env.MODE_EXPECTED === "shadow" && unit.maturity !== "candidate" && unit.maturity !== "active") {
  throw new Error(`${unit.id} is not ready for shadow deployment`);
}
NODE

  if [ "$MODE" = "activate" ]; then
    node "$SCRIPT_DIR/internal-rpc-deployment-guard.mjs" direct \
      --graph "$graph" --unit "$UNIT_ID" --action activate
  fi

  local active_slot="" slot="blue"
  if [ -f "$CURRENT_STATE_FILE" ]; then
    active_slot="$(read_json_field "$CURRENT_STATE_FILE" active.slot)"
    [ "$active_slot" = "blue" ] && slot=green || slot=blue
  fi
  local deployment_id artifact_sha release_id release_dir temporary_release manifest_copy receipt_file
  deployment_id="$(read_json_field "$manifest" build.deploymentId)"
  artifact_sha="$(read_json_field "$manifest" artifact.sha256)"
  release_id="$deployment_id-${artifact_sha:0:12}"
  release_dir="$RELEASE_ROOT/$release_id"
  temporary_release="$RELEASE_ROOT/.extract-$release_id-$$"
  if [ ! -d "$release_dir" ]; then
    rm -rf "$temporary_release"
    mkdir -m 700 "$temporary_release"
    safe_extract_artifact "$artifact" "$temporary_release"
    mv "$temporary_release" "$release_dir"
    cp "$manifest" "$release_dir/artifact.manifest.json"
    cp "$contract" "$release_dir/deploy-unit-contract.json"
    chmod 600 "$release_dir/artifact.manifest.json" "$release_dir/deploy-unit-contract.json"
  else
    if ! cmp -s "$manifest" "$release_dir/artifact.manifest.json" \
      || ! cmp -s "$contract" "$release_dir/deploy-unit-contract.json"; then
      echo "[错误] immutable release identity collision: $release_dir" >&2
      exit 1
    fi
  fi
  manifest_copy="$release_dir/artifact.manifest.json"

  start_release "$manifest_copy" "$release_dir" "$slot" >/dev/null
  receipt_file="$RECEIPT_ROOT/$release_id-$slot.json"
  if [ ! -f "$receipt_file" ]; then
    node "$SCRIPT_DIR/deploy-unit-release.mjs" receipt-write \
      --manifest "$manifest_copy" \
      --control-plane-receipt "$CONTROL_PLANE_RECEIPT" \
      --tenant-manifest "$TENANT_MANIFEST" \
      --release-id "$release_id" \
      --release-dir "$release_dir" \
      --slot "$slot" \
      --receipt "$receipt_file"
  fi

  if [ "$MODE" = "shadow" ]; then
    pm2 save
    write_unit_deploy_event deploy "$manifest_copy" "$release_dir/deploy-unit-contract.json" "$release_id" "" shadow
    echo "$UNIT_ID shadow-ready: $release_id ($slot)"
    return
  fi

  local activation_file proposed_state generation_id
  activation_file="$UNIT_ROOT/activation-$release_id.json"
  if [ "$MODE" = "prepare" ]; then
    proposed_state="$PREPARED_STATE_ROOT/$UNIT_ID.json"
    [ ! -e "$proposed_state" ] || { echo "[错误] prepared state 已存在，请使用新的 rollout root: $proposed_state" >&2; exit 1; }
  else
    proposed_state="$UNIT_ROOT/proposed-state-$release_id.json"
  fi
  node "$SCRIPT_DIR/deploy-unit-release.mjs" activation-write --receipt "$receipt_file" --activation "$activation_file"
  if [ -f "$CURRENT_STATE_FILE" ]; then
    cp "$CURRENT_STATE_FILE" "$proposed_state"
  fi
  node "$SCRIPT_DIR/deploy-unit-release.mjs" state-promote --state "$proposed_state" --activation "$activation_file"
  start_release_sidecars "$manifest_copy" "$release_dir" "$slot"
  if [ "$MODE" = "prepare" ]; then
    pm2 save
    rm -f "$activation_file"
    echo "$UNIT_ID profile-prepared: $release_id ($slot), state $proposed_state"
    return
  fi
  generation_id="$(create_gateway_generation "$graph" "$proposed_state")"
  switch_gateway "$generation_id"
  if [ -n "$active_slot" ]; then
    pm2 delete "$(read_json_field "$manifest_copy" runtime.processName)-$active_slot" >/dev/null 2>&1 || true
    stop_release_sidecars "$release_dir" "$active_slot"
  fi
  pm2 save
  write_unit_deploy_event deploy "$manifest_copy" "$release_dir/deploy-unit-contract.json" "$release_id" "$generation_id" activate
  rm -f "$activation_file" "$proposed_state"
  echo "$UNIT_ID active: $release_id ($slot), Gateway $generation_id"
}

rollback_unit() {
  [ -f "$CURRENT_STATE_FILE" ] || { echo "[错误] $UNIT_ID 没有 active Gateway state" >&2; exit 1; }
  local graph="$CURRENT_GATEWAY/deploy-graph.json"
  [ -f "$graph" ] || { echo "[错误] 当前 deploy graph 不存在" >&2; exit 1; }
  node "$SCRIPT_DIR/internal-rpc-deployment-guard.mjs" direct \
    --graph "$graph" --unit "$UNIT_ID" --action rollback
  local proposed_state="$UNIT_ROOT/proposed-rollback-state-$$.json"
  cp "$CURRENT_STATE_FILE" "$proposed_state"
  node "$SCRIPT_DIR/deploy-unit-release.mjs" state-rollback --state "$proposed_state"
  local release_dir release_id slot former_slot manifest contract generation_id
  release_dir="$(read_json_field "$proposed_state" active.releaseDir)"
  release_id="$(read_json_field "$proposed_state" active.releaseId)"
  slot="$(read_json_field "$proposed_state" active.slot)"
  former_slot="$(read_json_field "$proposed_state" previous.slot)"
  manifest="$release_dir/artifact.manifest.json"
  contract="$release_dir/deploy-unit-contract.json"
  [ -f "$manifest" ] && [ -f "$contract" ] && [ -f "$graph" ] || { echo "[错误] rollback release、contract 或 deploy graph 不完整" >&2; exit 1; }
  node "$SCRIPT_DIR/deploy-unit-release.mjs" control-plane-assert \
    --manifest "$manifest" --control-plane-receipt "$CONTROL_PLANE_RECEIPT" --tenant-manifest "$TENANT_MANIFEST" >/dev/null
  start_release "$manifest" "$release_dir" "$slot" >/dev/null
  generation_id="$(create_gateway_generation "$graph" "$proposed_state")"
  start_release_sidecars "$manifest" "$release_dir" "$slot"
  switch_gateway "$generation_id"
  pm2 delete "$(read_json_field "$manifest" runtime.processName)-$former_slot" >/dev/null 2>&1 || true
  stop_release_sidecars "$release_dir" "$former_slot"
  pm2 save
  write_unit_deploy_event rollback "$manifest" "$contract" "$release_id" "$generation_id" rollback
  rm -f "$proposed_state"
  echo "$UNIT_ID rolled back to $(read_json_field "$manifest" build.deploymentId), Gateway $generation_id"
}

if [ "$COMMAND" = "deploy" ]; then
  deploy_unit
else
  rollback_unit
fi
