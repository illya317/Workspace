#!/usr/bin/env bash
set -euo pipefail
GATEWAY_NGINX_SITE="$(printenv WORKSPACE_GATEWAY_NGINX_SITE 2>/dev/null || true)"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ops/deploy-unit-sidecar.sh
source "$SCRIPT_DIR/deploy-unit-sidecar.sh"
REMOTE_DIR="${REMOTE_DIR:-}"
RECEIPT_FILE="${1:-}"
if [ "$#" -ne 1 ] || [ ! -f "$RECEIPT_FILE" ]; then
  echo "用法: $0 <profile-promotion-receipt.json>" >&2
  exit 2
fi
if [ -z "$REMOTE_DIR" ] || [ "${REMOTE_DIR#/}" = "$REMOTE_DIR" ]; then
  echo "[错误] REMOTE_DIR 必须是绝对路径" >&2
  exit 1
fi
CONFIG_ROOT="$REMOTE_DIR/.workspace"
LOCK_FILE="$CONFIG_ROOT/deploy.lock"
mkdir -p "$CONFIG_ROOT"
command -v flock >/dev/null
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[错误] 另一生产部署正在运行" >&2
  exit 73
fi
node "$SCRIPT_DIR/deployment-profile-promotion.mjs" receipt-assert --receipt "$RECEIPT_FILE" >/dev/null
PROMOTED_GENERATION_ID="$(node -e '
const value=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8"));
if (!/^[0-9a-f]{64}$/.test(value.generationId ?? "")) throw new Error("profile promotion generation is invalid");
process.stdout.write(value.generationId);
' "$RECEIPT_FILE")"
PREVIOUS_GENERATION_ID="$(node -e '
const value=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8"));
if (!/^[0-9a-f]{64}$/.test(value.previousGenerationId ?? "")) throw new Error("profile promotion has no rollback generation");
process.stdout.write(value.previousGenerationId);
' "$RECEIPT_FILE")"
GATEWAY_ROOT="$REMOTE_DIR/.workspace/gateway"
MONOLITH_WECOM_PROCESS_NAME="${WORKSPACE_MONOLITH_WECOM_PROCESS_NAME:-workspace-wecom-agent}"
[[ "$MONOLITH_WECOM_PROCESS_NAME" =~ ^[A-Za-z0-9._-]+$ ]] || {
  echo "[错误] WORKSPACE_MONOLITH_WECOM_PROCESS_NAME 不是安全的 PM2 名称" >&2
  exit 1
}
CURRENT_ROUTE_MAP="$GATEWAY_ROOT/current/route-map.json"
[ -f "$CURRENT_ROUTE_MAP" ] || { echo "[错误] 当前 Gateway route map 不存在" >&2; exit 1; }
CURRENT_GENERATION_ID="$(node -e '
const value=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8"));
if (!/^[0-9a-f]{64}$/.test(value.generationId ?? "")) throw new Error("current Gateway generation is invalid");
process.stdout.write(value.generationId);
' "$CURRENT_ROUTE_MAP")"
[ "$CURRENT_GENERATION_ID" = "$PROMOTED_GENERATION_ID" ] || {
  echo "[错误] promotion receipt 已过期：当前 Gateway generation 已变化" >&2
  exit 1
}
TARGET="$GATEWAY_ROOT/generations/$PREVIOUS_GENERATION_ID"
[ -d "$TARGET" ] || { echo "[错误] rollback Gateway generation 不存在" >&2; exit 1; }
CURRENT_GATEWAY_TARGET="$(readlink -f "$GATEWAY_ROOT/current")"
CURRENT_ASSISTANT_STATE="$CURRENT_GATEWAY_TARGET/unit-states/assistant.json"
TARGET_ASSISTANT_STATE="$TARGET/unit-states/assistant.json"
CURRENT_ASSISTANT_ID="none"
TARGET_ASSISTANT_ID="none"
CURRENT_ASSISTANT_RELEASE=""
CURRENT_ASSISTANT_MANIFEST=""
CURRENT_ASSISTANT_SLOT=""
TARGET_ASSISTANT_RELEASE=""
TARGET_ASSISTANT_MANIFEST=""
TARGET_ASSISTANT_SLOT=""
if [ -f "$CURRENT_ASSISTANT_STATE" ]; then
  CURRENT_ASSISTANT_RELEASE="$(workspace_sidecar_read_json_field "$CURRENT_ASSISTANT_STATE" active.releaseDir)"
  CURRENT_ASSISTANT_SLOT="$(workspace_sidecar_read_json_field "$CURRENT_ASSISTANT_STATE" active.slot)"
  CURRENT_ASSISTANT_ID="$(workspace_sidecar_read_json_field "$CURRENT_ASSISTANT_STATE" active.releaseId):$CURRENT_ASSISTANT_SLOT"
  CURRENT_ASSISTANT_MANIFEST="$CURRENT_ASSISTANT_RELEASE/artifact.manifest.json"
  [ -f "$CURRENT_ASSISTANT_MANIFEST" ] || { echo "[错误] 当前 Assistant release manifest 不存在" >&2; exit 1; }
fi
if [ -f "$TARGET_ASSISTANT_STATE" ]; then
  TARGET_ASSISTANT_RELEASE="$(workspace_sidecar_read_json_field "$TARGET_ASSISTANT_STATE" active.releaseDir)"
  TARGET_ASSISTANT_SLOT="$(workspace_sidecar_read_json_field "$TARGET_ASSISTANT_STATE" active.slot)"
  TARGET_ASSISTANT_ID="$(workspace_sidecar_read_json_field "$TARGET_ASSISTANT_STATE" active.releaseId):$TARGET_ASSISTANT_SLOT"
  TARGET_ASSISTANT_MANIFEST="$TARGET_ASSISTANT_RELEASE/artifact.manifest.json"
  [ -f "$TARGET_ASSISTANT_MANIFEST" ] || { echo "[错误] rollback Assistant release manifest 不存在" >&2; exit 1; }
fi
ASSISTANT_TRANSITION=0
[ "$CURRENT_ASSISTANT_ID" = "$TARGET_ASSISTANT_ID" ] || ASSISTANT_TRANSITION=1
CURRENT_ASSISTANT_STOPPED=0
CURRENT_MONOLITH_WAS_ONLINE=0
TARGET_ASSISTANT_STARTED=0
TARGET_MONOLITH_STARTED=0
ASSISTANT_HANDOFF_COMMITTED=0
GATEWAY_SWITCHED=0
cleanup_sidecar_transition() {
  local exit_code=$?
  set +e
  if [ "$exit_code" -ne 0 ] && [ "$ASSISTANT_TRANSITION" = "1" ] \
    && [ "$ASSISTANT_HANDOFF_COMMITTED" = "0" ]; then
    local gateway_restored=1
    if [ "$TARGET_ASSISTANT_STARTED" = "1" ]; then
      workspace_stop_deploy_unit_sidecar assistant "$TARGET_ASSISTANT_RELEASE" "$TARGET_ASSISTANT_SLOT" || true
    fi
    if [ "$TARGET_MONOLITH_STARTED" = "1" ]; then
      pm2 stop "$MONOLITH_WECOM_PROCESS_NAME" >/dev/null 2>&1 || true
      workspace_sidecar_wait_inactive "$MONOLITH_WECOM_PROCESS_NAME" || true
    fi
    if [ "$GATEWAY_SWITCHED" = "1" ]; then
      WORKSPACE_GATEWAY_ROOT="$GATEWAY_ROOT" WORKSPACE_GATEWAY_NGINX_SITE="$GATEWAY_NGINX_SITE" \
        "$SCRIPT_DIR/switch-deploy-gateway.sh" --generation "$CURRENT_GATEWAY_TARGET" \
        || gateway_restored=0
    fi
    if [ "$CURRENT_ASSISTANT_STOPPED" = "1" ] && [ "$gateway_restored" = "1" ]; then
      workspace_start_deploy_unit_sidecar \
        assistant "$CONFIG_ROOT" "$CURRENT_ASSISTANT_MANIFEST" "$CURRENT_ASSISTANT_RELEASE" "$CURRENT_ASSISTANT_SLOT" \
        "$SCRIPT_DIR/assistant-runtime.mjs" || true
    elif [ "$CURRENT_MONOLITH_WAS_ONLINE" = "1" ] && [ "$gateway_restored" = "1" ]; then
      WORKSPACE_MONOLITH_WECOM_SIDECAR_WAS_ONLINE=1
      workspace_restore_monolith_wecom_sidecar "$MONOLITH_WECOM_PROCESS_NAME" || true
    fi
    pm2 save >/dev/null 2>&1 || true
  fi
  exit "$exit_code"
}
trap cleanup_sidecar_transition EXIT
if [ "$ASSISTANT_TRANSITION" = "1" ]; then
  workspace_suspend_monolith_wecom_sidecar "$MONOLITH_WECOM_PROCESS_NAME"
  CURRENT_MONOLITH_WAS_ONLINE="$WORKSPACE_MONOLITH_WECOM_SIDECAR_WAS_ONLINE"
fi
if [ "$ASSISTANT_TRANSITION" = "1" ] && [ -n "$CURRENT_ASSISTANT_RELEASE" ]; then
  CURRENT_ASSISTANT_STOPPED=1
  workspace_stop_deploy_unit_sidecar assistant "$CURRENT_ASSISTANT_RELEASE" "$CURRENT_ASSISTANT_SLOT"
fi
WORKSPACE_GATEWAY_ROOT="$GATEWAY_ROOT" \
  WORKSPACE_GATEWAY_NGINX_SITE="$GATEWAY_NGINX_SITE" \
  "$SCRIPT_DIR/switch-deploy-gateway.sh" --generation "$TARGET"
GATEWAY_SWITCHED=1
if [ "$ASSISTANT_TRANSITION" = "1" ] && [ -n "$TARGET_ASSISTANT_RELEASE" ]; then
  TARGET_ASSISTANT_STARTED=1
  workspace_start_deploy_unit_sidecar \
    assistant "$CONFIG_ROOT" "$TARGET_ASSISTANT_MANIFEST" "$TARGET_ASSISTANT_RELEASE" "$TARGET_ASSISTANT_SLOT" \
    "$SCRIPT_DIR/assistant-runtime.mjs"
elif [ "$ASSISTANT_TRANSITION" = "1" ]; then
  TARGET_MONOLITH_STARTED=1
  workspace_activate_monolith_wecom_sidecar "$MONOLITH_WECOM_PROCESS_NAME"
fi
if [ "$ASSISTANT_TRANSITION" = "1" ]; then ASSISTANT_HANDOFF_COMMITTED=1; fi
if [ "$ASSISTANT_TRANSITION" = "1" ]; then pm2 save; fi
trap - EXIT
echo "Workspace profile rolled back to Gateway generation $PREVIOUS_GENERATION_ID"
