#!/usr/bin/env bash
set -euo pipefail
GATEWAY_NGINX_SITE="$(printenv WORKSPACE_GATEWAY_NGINX_SITE 2>/dev/null || true)"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ops/deploy-unit-sidecar.sh
source "$SCRIPT_DIR/deploy-unit-sidecar.sh"
REMOTE_DIR="${REMOTE_DIR:-}"
PROFILE_FILE="${1:-}"
RELEASE_FILE="${2:-}"
ROLLOUT_FILE="${3:-}"
OBSERVATION_RESULT_FILE="${4:-}"
GRAPH_FILE="${5:-}"
PROPOSED_STATE_ROOT="${6:-}"
DEPLOY_EVENT_FILE="${DEPLOY_EVENT_FILE:-$HOME/.finance-bot-deploy-event.json}"
DEPLOY_PACKAGE_VERSION="${DEPLOY_PACKAGE_VERSION:-unknown}"
DEPLOY_STARTED_EPOCH_SECONDS="${DEPLOY_STARTED_EPOCH_SECONDS:-$(date +%s)}"

if [ "$#" -ne 6 ]; then
  echo "用法: $0 <profile.json> <release.json> <rollout.json> <observation-result.json> <deploy-graph.json> <proposed-state-root>" >&2
  exit 2
fi
if [ -z "$REMOTE_DIR" ] || [ "${REMOTE_DIR#/}" = "$REMOTE_DIR" ]; then
  echo "[错误] REMOTE_DIR 必须是绝对路径" >&2
  exit 1
fi
for file in "$PROFILE_FILE" "$RELEASE_FILE" "$ROLLOUT_FILE" "$OBSERVATION_RESULT_FILE" "$GRAPH_FILE"; do
  [ -f "$file" ] || { echo "[错误] profile promotion 输入不存在: $file" >&2; exit 1; }
done
[ -d "$PROPOSED_STATE_ROOT" ] || { echo "[错误] proposed state root 不存在" >&2; exit 1; }

CONFIG_ROOT="$REMOTE_DIR/.workspace"
GATEWAY_ROOT="$CONFIG_ROOT/gateway"
MONOLITH_WECOM_PROCESS_NAME="${WORKSPACE_MONOLITH_WECOM_PROCESS_NAME:-workspace-wecom-agent}"
[[ "$MONOLITH_WECOM_PROCESS_NAME" =~ ^[A-Za-z0-9._-]+$ ]] || {
  echo "[错误] WORKSPACE_MONOLITH_WECOM_PROCESS_NAME 不是安全的 PM2 名称" >&2
  exit 1
}
CURRENT_GATEWAY="$GATEWAY_ROOT/current"
CURRENT_STATE_ROOT="$CURRENT_GATEWAY/unit-states"
EMPTY_STATE_ROOT="$GATEWAY_ROOT/empty-states"
PROMOTION_ROOT="$GATEWAY_ROOT/profile-promotions"
LOCK_FILE="$CONFIG_ROOT/deploy.lock"
mkdir -p "$EMPTY_STATE_ROOT" "$PROMOTION_ROOT"
chmod 700 "$EMPTY_STATE_ROOT" "$PROMOTION_ROOT"

command -v flock >/dev/null
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[错误] 另一生产部署正在运行" >&2
  exit 73
fi

PROMOTION_FILE="$(mktemp "$PROMOTION_ROOT/.promotion-XXXXXX.json")"
ASSISTANT_TRANSITION=0
ASSISTANT_OLD_STOPPED=0
ASSISTANT_MONOLITH_WAS_ONLINE=0
ASSISTANT_NEW_STARTED=0
ASSISTANT_HANDOFF_COMMITTED=0
GATEWAY_SWITCHED=0
OLD_GATEWAY_TARGET=""
if [ -L "$CURRENT_GATEWAY" ]; then
  OLD_GATEWAY_TARGET="$(readlink -f "$CURRENT_GATEWAY")"
elif [ -e "$CURRENT_GATEWAY" ]; then
  echo "[错误] Gateway current 必须是 symlink" >&2
  exit 1
fi
ASSISTANT_OLD_RELEASE=""
ASSISTANT_OLD_MANIFEST=""
ASSISTANT_OLD_SLOT=""
ASSISTANT_NEW_RELEASE=""
ASSISTANT_NEW_MANIFEST=""
ASSISTANT_NEW_SLOT=""
cleanup() {
  local exit_code=$?
  set +e
  rm -f "$PROMOTION_FILE"
  if [ "$exit_code" -ne 0 ] && [ "$ASSISTANT_TRANSITION" = "1" ] \
    && [ "$ASSISTANT_HANDOFF_COMMITTED" = "0" ]; then
    local gateway_restored=1
    if [ "$ASSISTANT_NEW_STARTED" = "1" ]; then
      workspace_stop_deploy_unit_sidecar assistant "$ASSISTANT_NEW_RELEASE" "$ASSISTANT_NEW_SLOT" || true
    fi
    if [ "$GATEWAY_SWITCHED" = "1" ] && [ -n "$OLD_GATEWAY_TARGET" ]; then
      WORKSPACE_GATEWAY_ROOT="$GATEWAY_ROOT" \
        WORKSPACE_GATEWAY_NGINX_SITE="$GATEWAY_NGINX_SITE" \
        "$SCRIPT_DIR/switch-deploy-gateway.sh" --generation "$OLD_GATEWAY_TARGET" \
        || gateway_restored=0
    elif [ "$GATEWAY_SWITCHED" = "1" ]; then
      gateway_restored=0
    fi
    if [ "$ASSISTANT_OLD_STOPPED" = "1" ] && [ "$gateway_restored" = "1" ]; then
      workspace_start_deploy_unit_sidecar \
        assistant "$CONFIG_ROOT" "$ASSISTANT_OLD_MANIFEST" "$ASSISTANT_OLD_RELEASE" "$ASSISTANT_OLD_SLOT" \
        "$SCRIPT_DIR/assistant-runtime.mjs" || true
    elif [ "$ASSISTANT_MONOLITH_WAS_ONLINE" = "1" ] && [ "$gateway_restored" = "1" ]; then
      WORKSPACE_MONOLITH_WECOM_SIDECAR_WAS_ONLINE=1
      workspace_restore_monolith_wecom_sidecar "$MONOLITH_WECOM_PROCESS_NAME" || true
    fi
    pm2 save >/dev/null 2>&1 || true
  fi
  exit "$exit_code"
}
trap cleanup EXIT

promotion_args=(
  write
  --profile "$PROFILE_FILE"
  --release "$RELEASE_FILE"
  --rollout "$ROLLOUT_FILE"
  --graph "$GRAPH_FILE"
  --observation-result "$OBSERVATION_RESULT_FILE"
  --proposed-state-root "$PROPOSED_STATE_ROOT"
  --output "$PROMOTION_FILE"
)
if [ -d "$CURRENT_GATEWAY" ]; then promotion_args+=(--current-gateway "$CURRENT_GATEWAY"); fi
node "$SCRIPT_DIR/deployment-profile-promotion.mjs" "${promotion_args[@]}"
node "$SCRIPT_DIR/internal-rpc-deployment-guard.mjs" promotion \
  --graph "$GRAPH_FILE" \
  --promotion "$PROMOTION_FILE"

ASSISTANT_PROPOSED_STATE="$(node -e '
const value=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8"));
const assistant=value.stateOverrides.find((item) => item.unitId === "assistant");
if (assistant) process.stdout.write(assistant.file);
' "$PROMOTION_FILE")"
if [ -n "$ASSISTANT_PROPOSED_STATE" ]; then
  [ -f "$ASSISTANT_PROPOSED_STATE" ] || { echo "[错误] Assistant proposed state 不存在" >&2; exit 1; }
  ASSISTANT_TRANSITION=1
  ASSISTANT_NEW_RELEASE="$(workspace_sidecar_read_json_field "$ASSISTANT_PROPOSED_STATE" active.releaseDir)"
  ASSISTANT_NEW_SLOT="$(workspace_sidecar_read_json_field "$ASSISTANT_PROPOSED_STATE" active.slot)"
  ASSISTANT_NEW_MANIFEST="$ASSISTANT_NEW_RELEASE/artifact.manifest.json"
  [ -f "$ASSISTANT_NEW_MANIFEST" ] || { echo "[错误] Assistant 新 release manifest 不存在" >&2; exit 1; }
  if [ -f "$CURRENT_STATE_ROOT/assistant.json" ]; then
    ASSISTANT_OLD_RELEASE="$(workspace_sidecar_read_json_field "$CURRENT_STATE_ROOT/assistant.json" active.releaseDir)"
    ASSISTANT_OLD_SLOT="$(workspace_sidecar_read_json_field "$CURRENT_STATE_ROOT/assistant.json" active.slot)"
    ASSISTANT_OLD_MANIFEST="$ASSISTANT_OLD_RELEASE/artifact.manifest.json"
    [ -f "$ASSISTANT_OLD_MANIFEST" ] || { echo "[错误] Assistant 旧 release manifest 不存在" >&2; exit 1; }
  fi
fi

STATE_ROOT="$EMPTY_STATE_ROOT"
[ ! -d "$CURRENT_STATE_ROOT" ] || STATE_ROOT="$CURRENT_STATE_ROOT"
generation_args=(
  create
  --graph "$GRAPH_FILE"
  --state-root "$STATE_ROOT"
  --output-root "$GATEWAY_ROOT"
  --generated-at "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
)
if [ "$ASSISTANT_TRANSITION" = "1" ] && [ -z "$OLD_GATEWAY_TARGET" ]; then
  OLD_GENERATION_ID="$(node "$SCRIPT_DIR/gateway-generation.mjs" create-fallback \
    --graph "$GRAPH_FILE" \
    --output-root "$GATEWAY_ROOT" \
    --generated-at "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)")"
  OLD_GATEWAY_TARGET="$GATEWAY_ROOT/generations/$OLD_GENERATION_ID"
fi
# shellcheck disable=SC2016
while IFS=$'\t' read -r unit_id state_file; do
  [[ "$unit_id" =~ ^[a-z][a-z0-9-]*$ ]] || { echo "[错误] promotion unit id 无效" >&2; exit 1; }
  [ "${state_file#/}" != "$state_file" ] && [ -f "$state_file" ] || { echo "[错误] promotion state 无效" >&2; exit 1; }
  generation_args+=(--state "$unit_id=$state_file")
done < <(node -e '
const p=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8"));
for (const item of p.stateOverrides) process.stdout.write(`${item.unitId}\t${item.file}\n`);
' "$PROMOTION_FILE")

GENERATION_ID="$(node "$SCRIPT_DIR/gateway-generation.mjs" "${generation_args[@]}")"
if [ "$ASSISTANT_TRANSITION" = "1" ]; then
  workspace_suspend_monolith_wecom_sidecar "$MONOLITH_WECOM_PROCESS_NAME"
  ASSISTANT_MONOLITH_WAS_ONLINE="$WORKSPACE_MONOLITH_WECOM_SIDECAR_WAS_ONLINE"
fi
if [ "$ASSISTANT_TRANSITION" = "1" ] && [ -n "$ASSISTANT_OLD_RELEASE" ]; then
  ASSISTANT_OLD_STOPPED=1
  workspace_stop_deploy_unit_sidecar assistant "$ASSISTANT_OLD_RELEASE" "$ASSISTANT_OLD_SLOT"
fi
WORKSPACE_GATEWAY_ROOT="$GATEWAY_ROOT" \
  WORKSPACE_GATEWAY_NGINX_SITE="$GATEWAY_NGINX_SITE" \
  "$SCRIPT_DIR/switch-deploy-gateway.sh" --generation "$GATEWAY_ROOT/generations/$GENERATION_ID"
GATEWAY_SWITCHED=1
if [ "$ASSISTANT_TRANSITION" = "1" ]; then
  ASSISTANT_NEW_STARTED=1
  workspace_start_deploy_unit_sidecar \
    assistant "$CONFIG_ROOT" "$ASSISTANT_NEW_MANIFEST" "$ASSISTANT_NEW_RELEASE" "$ASSISTANT_NEW_SLOT" \
    "$SCRIPT_DIR/assistant-runtime.mjs"
  ASSISTANT_HANDOFF_COMMITTED=1
  pm2 save
fi

PROMOTION_SHA="$(node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).promotionSha256)' "$PROMOTION_FILE")"
FINAL_PROMOTION="$PROMOTION_ROOT/$PROMOTION_SHA.json"
RECEIPT_FILE="$PROMOTION_ROOT/$PROMOTION_SHA.receipt.json"
mv "$PROMOTION_FILE" "$FINAL_PROMOTION"
node "$SCRIPT_DIR/deployment-profile-promotion.mjs" receipt-write \
  --promotion "$FINAL_PROMOTION" \
  --generation-id "$GENERATION_ID" \
  --output "$RECEIPT_FILE"
case "$DEPLOY_STARTED_EPOCH_SECONDS" in
  ''|*[!0-9]*) echo "[错误] Profile 部署开始时间无效" >&2; exit 1 ;;
esac
DEPLOY_DURATION_SECONDS="$(($(date +%s) - DEPLOY_STARTED_EPOCH_SECONDS))"
[ "$DEPLOY_DURATION_SECONDS" -ge 0 ] || { echo "[错误] Profile 部署开始时间晚于完成时间" >&2; exit 1; }
node "$SCRIPT_DIR/deploy-notification.mjs" profile-write \
  --profile "$PROFILE_FILE" \
  --release "$RELEASE_FILE" \
  --receipt "$RECEIPT_FILE" \
  --action deploy \
  --package-version "$DEPLOY_PACKAGE_VERSION" \
  --duration-seconds "$DEPLOY_DURATION_SECONDS" \
  --history-dir "$CONFIG_ROOT/deployment-history" \
  --event-file "$DEPLOY_EVENT_FILE"
trap - EXIT
echo "Workspace profile promotion committed: $GENERATION_ID"
echo "promotion receipt: $RECEIPT_FILE"
