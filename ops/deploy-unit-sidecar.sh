#!/usr/bin/env bash

workspace_sidecar_read_json_field() {
  node -e '
const fs = require("node:fs");
const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
let current = value;
for (const segment of process.argv[2].split(".")) current = current?.[segment];
if (typeof current !== "string" && typeof current !== "number") {
  throw new Error("field " + process.argv[2] + " is missing");
}
process.stdout.write(String(current));
' "$1" "$2"
}

workspace_sidecar_load_runtime_environment() {
  local config_root=$1
  if [ -f "$config_root/.env" ]; then
    set +u
    set -a
    # shellcheck source=/dev/null
    source "$config_root/.env"
    set +a
    set -u
  fi
}

workspace_sidecar_wait_online() {
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

workspace_sidecar_wait_absent() {
  local process_name=$1
  for _ in $(seq 1 15); do
    if pm2 jlist | PM2_PROCESS_NAME="$process_name" node -e '
const fs = require("node:fs");
const processes = JSON.parse(fs.readFileSync(0, "utf8"));
if (processes.some((item) => item?.name === process.env.PM2_PROCESS_NAME)) process.exit(1);
'; then
      return
    fi
    sleep 1
  done
  echo "[错误] Assistant sidecar 未停止: $process_name" >&2
  return 1
}

workspace_sidecar_process_state() {
  local process_name=$1
  pm2 jlist | PM2_PROCESS_NAME="$process_name" node -e '
const fs = require("node:fs");
const processes = JSON.parse(fs.readFileSync(0, "utf8"));
if (!Array.isArray(processes)) throw new Error("PM2 process list is invalid");
const matches = processes.filter((item) => item?.name === process.env.PM2_PROCESS_NAME);
if (matches.length > 1) throw new Error("PM2 process name is duplicated");
if (matches.length === 0) {
  process.stdout.write("missing");
} else {
  const entry = matches[0];
  const status = entry?.pm2_env?.status;
  const pid = entry?.pid ?? 0;
  if (status === "online" && Number.isInteger(pid) && pid > 0) {
    process.stdout.write("online");
  } else if (status === "stopped" && pid === 0) {
    process.stdout.write("inactive");
  } else {
    throw new Error("PM2 process state is not safely classified");
  }
}
'
}

workspace_sidecar_wait_inactive() {
  local process_name=$1
  local state
  for _ in $(seq 1 15); do
    state="$(workspace_sidecar_process_state "$process_name" 2>/dev/null || true)"
    if [ "$state" = "missing" ] || [ "$state" = "inactive" ]; then
      return
    fi
    sleep 1
  done
  echo "[错误] 企业微信 sidecar 未进入 inactive: $process_name" >&2
  return 1
}

workspace_suspend_monolith_wecom_sidecar() {
  local process_name=$1
  local state
  WORKSPACE_MONOLITH_WECOM_SIDECAR_WAS_ONLINE=0
  state="$(workspace_sidecar_process_state "$process_name")"
  case "$state" in
    missing|inactive) return 0 ;;
    online)
      WORKSPACE_MONOLITH_WECOM_SIDECAR_WAS_ONLINE=1
      pm2 stop "$process_name" >/dev/null
      workspace_sidecar_wait_inactive "$process_name"
      ;;
    *) echo "[错误] 无法确认 monolith 企业微信 sidecar 状态: $process_name" >&2; return 1 ;;
  esac
}

workspace_restore_monolith_wecom_sidecar() {
  local process_name=$1
  [ "${WORKSPACE_MONOLITH_WECOM_SIDECAR_WAS_ONLINE:-0}" = "1" ] || return 0
  pm2 restart "$process_name" --update-env >/dev/null
  workspace_sidecar_wait_online "$process_name"
}

workspace_activate_monolith_wecom_sidecar() {
  local process_name=$1
  local state
  state="$(workspace_sidecar_process_state "$process_name")"
  case "$state" in
    online) return 0 ;;
    inactive)
      pm2 restart "$process_name" --update-env >/dev/null
      workspace_sidecar_wait_online "$process_name"
      ;;
    missing)
      echo "[错误] monolith 企业微信 sidecar PM2 定义不存在: $process_name" >&2
      return 1
      ;;
    *) echo "[错误] 无法激活 monolith 企业微信 sidecar: $process_name" >&2; return 1 ;;
  esac
}

workspace_deploy_unit_sidecar_process_name() {
  local release_dir=$1
  local slot=$2
  local descriptor="$release_dir/.assistant-runtime.json"
  [ -f "$descriptor" ] || { echo "[错误] Assistant runtime descriptor 不存在" >&2; return 1; }
  printf '%s-%s' "$(workspace_sidecar_read_json_field "$descriptor" sidecars.0.processName)" "$slot"
}

workspace_capture_gateway_assistant_owner() {
  local gateway_root=$1
  local current="$gateway_root/current"
  local marker="$gateway_root/committed-generation"
  local generations="$gateway_root/generations"
  local target generation_id committed state_file values
  WORKSPACE_GATEWAY_ASSISTANT_ACTIVE=0
  WORKSPACE_GATEWAY_ASSISTANT_GATEWAY_TARGET=""
  WORKSPACE_GATEWAY_ASSISTANT_STATE_FILE=""
  WORKSPACE_GATEWAY_ASSISTANT_RELEASE=""
  WORKSPACE_GATEWAY_ASSISTANT_MANIFEST=""
  WORKSPACE_GATEWAY_ASSISTANT_SLOT=""
  WORKSPACE_GATEWAY_ASSISTANT_PROCESS=""
  if [ ! -L "$current" ]; then
    if [ -e "$current" ] || [ -e "$marker" ]; then
      echo "[错误] Gateway ownership state 不完整" >&2
      return 2
    fi
    return 1
  fi
  target="$(readlink -f "$current")"
  generation_id="$(basename "$target")"
  if [ ! -d "$generations" ] || [ "$(dirname "$target")" != "$(readlink -f "$generations")" ] \
    || ! printf '%s' "$generation_id" | grep -Eq '^[0-9a-f]{64}$'; then
    echo "[错误] Gateway current generation 越界或 identity 无效" >&2
    return 2
  fi
  state_file="$target/unit-states/assistant.json"
  if [ -L "$marker" ]; then
    echo "[错误] Gateway committed generation marker 不能是符号链接" >&2
    return 2
  elif [ -f "$marker" ]; then
    committed="$(tr -d '\n' < "$marker")"
    if [ "$committed" != "$generation_id" ]; then
      echo "[错误] Gateway current 与 committed generation 不一致" >&2
      return 2
    fi
  elif [ -e "$marker" ] || [ -L "$marker" ]; then
    echo "[错误] Gateway committed generation marker 无效" >&2
    return 2
  elif [ -e "$state_file" ] || [ -L "$state_file" ]; then
    echo "[错误] Gateway Assistant state 存在但 committed generation marker 缺失" >&2
    return 2
  fi
  if [ -L "$state_file" ] || { [ -e "$state_file" ] && [ ! -f "$state_file" ]; }; then
    echo "[错误] Gateway Assistant state 不是普通文件" >&2
    return 2
  fi
  [ -f "$state_file" ] || return 1
  values="$(node - "$state_file" <<'NODE'
const fs = require("node:fs");
const value = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (value?.schemaVersion !== 1 || value.kind !== "workspace-deploy-unit-state"
  || value.unitId !== "assistant" || value.active?.unitId !== "assistant"
  || !["blue", "green"].includes(value.active?.slot)
  || typeof value.active?.releaseDir !== "string" || !value.active.releaseDir.startsWith("/")) {
  throw new Error("Assistant Gateway state is invalid");
}
process.stdout.write(`${value.active.releaseDir}\t${value.active.slot}`);
NODE
  )"
  IFS=$'\t' read -r WORKSPACE_GATEWAY_ASSISTANT_RELEASE WORKSPACE_GATEWAY_ASSISTANT_SLOT <<< "$values"
  WORKSPACE_GATEWAY_ASSISTANT_MANIFEST="$WORKSPACE_GATEWAY_ASSISTANT_RELEASE/artifact.manifest.json"
  [ -f "$WORKSPACE_GATEWAY_ASSISTANT_MANIFEST" ] || { echo "[错误] Assistant active manifest 不存在" >&2; return 2; }
  WORKSPACE_GATEWAY_ASSISTANT_PROCESS="$(workspace_deploy_unit_sidecar_process_name \
    "$WORKSPACE_GATEWAY_ASSISTANT_RELEASE" "$WORKSPACE_GATEWAY_ASSISTANT_SLOT")"
  WORKSPACE_GATEWAY_ASSISTANT_ACTIVE=1
  WORKSPACE_GATEWAY_ASSISTANT_GATEWAY_TARGET="$target"
  WORKSPACE_GATEWAY_ASSISTANT_STATE_FILE="$state_file"
  return 0
}

workspace_start_deploy_unit_sidecar() {
  local unit_id=$1
  local config_root=$2
  local manifest_file=$3
  local release_dir=$4
  local slot=$5
  local assistant_runtime_tool=$6
  WORKSPACE_DEPLOY_UNIT_SIDECAR_PROCESS=""
  [ "$unit_id" = "assistant" ] || return 0
  local descriptor="$release_dir/.assistant-runtime.json"
  [ -f "$descriptor" ] || { echo "[错误] Assistant runtime descriptor 不存在" >&2; return 1; }
  workspace_sidecar_load_runtime_environment "$config_root"
  node "$assistant_runtime_tool" env-assert --release-root "$release_dir"
  local sidecar_name entry memory_mib bridge_path base_path port process_name opposite_slot opposite_process identity_root
  sidecar_name="$(workspace_sidecar_read_json_field "$descriptor" sidecars.0.processName)"
  entry="$(workspace_sidecar_read_json_field "$descriptor" sidecars.0.entry)"
  memory_mib="$(workspace_sidecar_read_json_field "$descriptor" sidecars.0.memoryMiB)"
  bridge_path="$(workspace_sidecar_read_json_field "$descriptor" sidecars.0.bridgePath)"
  base_path="$(workspace_sidecar_read_json_field "$manifest_file" build.basePath)"
  port="$(workspace_sidecar_read_json_field "$manifest_file" "runtime.slots.$slot.port")"
  process_name="$sidecar_name-$slot"
  [ "$slot" = "blue" ] && opposite_slot=green || opposite_slot=blue
  opposite_process="$sidecar_name-$opposite_slot"
  identity_root="$config_root/internal-unit-identities"
  pm2 delete "$opposite_process" >/dev/null 2>&1 || true
  workspace_sidecar_wait_absent "$opposite_process"
  pm2 delete "$process_name" >/dev/null 2>&1 || true
  workspace_sidecar_wait_absent "$process_name"
  PORT="$port" NEXT_PUBLIC_BASE_PATH="$base_path" WORKSPACE_CONFIG_DIR="$config_root" \
    WORKSPACE_DEPLOY_UNIT_ID="$unit_id" \
    WORKSPACE_DEPLOY_SLOT="$slot" \
    WORKSPACE_DEPLOY_CURRENT_STATE_FILE="$config_root/gateway/current/unit-states/$unit_id.json" \
    WORKSPACE_INTERNAL_SIGNING_PRIVATE_KEY_FILE="$identity_root/private/$unit_id.pem" \
    WORKSPACE_INTERNAL_TRUSTED_PUBLIC_KEYS_FILE="$identity_root/trusted-public-keys.json" \
    WORKSPACE_INTERNAL_REPLAY_DIRECTORY="$identity_root/replay/$unit_id" \
    WECHAT_BOT_BRIDGE_URL="http://127.0.0.1:$port$base_path$bridge_path" \
    pm2 start "$release_dir/$entry" --name "$process_name" --cwd "$release_dir" \
      --max-memory-restart "$memory_mib"M --update-env
  WORKSPACE_DEPLOY_UNIT_SIDECAR_PROCESS="$process_name"
  workspace_sidecar_wait_online "$process_name"
}

workspace_stop_deploy_unit_sidecar() {
  local unit_id=$1
  local release_dir=$2
  local slot=$3
  [ "$unit_id" = "assistant" ] || return 0
  local process_name
  process_name="$(workspace_deploy_unit_sidecar_process_name "$release_dir" "$slot")"
  pm2 delete "$process_name" >/dev/null 2>&1 || true
  workspace_sidecar_wait_absent "$process_name"
}
