#!/usr/bin/env bash
# shellcheck disable=SC2029
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

COMMAND="${1:-}"
UNIT_ID="${2:-}"
MODE="${3:-shadow}"
SERVER="${SERVER:-}"
REMOTE_DIR="${REMOTE_DIR:-}"
WORKSPACE_GATEWAY_NGINX_SITE="${WORKSPACE_GATEWAY_NGINX_SITE:-}"
WORKSPACE_MONOLITH_WECOM_PROCESS_NAME="${WORKSPACE_MONOLITH_WECOM_PROCESS_NAME:-${PM2_WECOM_BOT_NAME:-workspace-wecom-agent}}"
DEPLOY_STARTED_EPOCH_SECONDS="${DEPLOY_STARTED_EPOCH_SECONDS:-$(date +%s)}"
DEPLOY_PACKAGE_VERSION="${DEPLOY_PACKAGE_VERSION:-$(node -p "require('./package.json').version")}"
DEPLOY_RELEASE_PROCESS_SECONDS="${DEPLOY_RELEASE_PROCESS_SECONDS:-}"
DEPLOY_RELEASE_ATTEMPT_COUNT="${DEPLOY_RELEASE_ATTEMPT_COUNT:-}"
DEPLOY_RELEASE_PROCESS_STARTED_AT="${DEPLOY_RELEASE_PROCESS_STARTED_AT:-}"
DEPLOY_CNB_STAGES_BASE64="${DEPLOY_CNB_STAGES_BASE64:-}"

if [ -f .cnb-release.json ]; then
  deploy_metadata_values="$(node ops/release-deploy-metadata.mjs lines .cnb-release.json)"
  DEPLOY_STARTED_EPOCH_SECONDS="$(printf '%s\n' "$deploy_metadata_values" | sed -n '1p')"
  DEPLOY_RELEASE_PROCESS_SECONDS="$(printf '%s\n' "$deploy_metadata_values" | sed -n '2p')"
  DEPLOY_RELEASE_ATTEMPT_COUNT="$(printf '%s\n' "$deploy_metadata_values" | sed -n '3p')"
  DEPLOY_RELEASE_PROCESS_STARTED_AT="$(printf '%s\n' "$deploy_metadata_values" | sed -n '4p')"
fi
if [ -n "${RELEASE_TIMING_FILE:-}" ] && [ -f "$RELEASE_TIMING_FILE" ]; then
  DEPLOY_CNB_STAGES_BASE64="$(node - "$RELEASE_TIMING_FILE" "${RELEASE_SOURCE_SHA:-}" <<'NODE'
const fs = require('node:fs');
const [file, releaseId] = process.argv.slice(2);
const stages = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean)
  .map((line) => JSON.parse(line))
  .filter((event) => event.releaseId === releaseId && event.scope === 'cnb')
  .map(({ scope, stage, status, durationMs }) => ({ scope, stage, status, durationMs }));
process.stdout.write(Buffer.from(JSON.stringify(stages)).toString('base64'));
NODE
)"
fi

if [[ ! "$UNIT_ID" =~ ^[a-z][a-z0-9-]*$ ]]; then
  echo "用法: $0 deploy <unit> <shadow|prepare|activate> | rollback <unit>" >&2
  exit 2
fi
case "$COMMAND" in
  deploy)
    case "$MODE" in shadow|prepare|activate) ;; *) echo "[错误] mode 必须是 shadow、prepare 或 activate" >&2; exit 2 ;; esac
    [ "${DEPLOY_UNIT_TRUSTED_BUILD:-0}" = "1" ] || {
      echo "[错误] unit deploy 只接受 CNB trusted Linux artifact；请通过正式 unit release pipeline 调用" >&2
      exit 1
    }
    ;;
  rollback) MODE=rollback ;;
  *) echo "用法: $0 deploy <unit> <shadow|prepare|activate> | rollback <unit>" >&2; exit 2 ;;
esac

if [ "$MODE" = "prepare" ]; then
  [ -n "${DEPLOY_PROFILE_PREPARED_STATE_ROOT:-}" ] \
    && [ "${DEPLOY_PROFILE_PREPARED_STATE_ROOT#/}" != "$DEPLOY_PROFILE_PREPARED_STATE_ROOT" ] || {
    echo "[错误] prepare mode 需要绝对路径 DEPLOY_PROFILE_PREPARED_STATE_ROOT" >&2
    exit 2
  }
fi

[ -n "$SERVER" ] || { echo "[错误] 缺少 SERVER" >&2; exit 1; }
[ -n "$REMOTE_DIR" ] && [ "${REMOTE_DIR#/}" != "$REMOTE_DIR" ] || { echo "[错误] REMOTE_DIR 必须是绝对路径" >&2; exit 1; }
for value in "$SERVER" "$REMOTE_DIR" "$WORKSPACE_GATEWAY_NGINX_SITE" "$WORKSPACE_MONOLITH_WECOM_PROCESS_NAME" "${DEPLOY_PROFILE_PREPARED_STATE_ROOT:-}"; do
  [[ "$value" != *"'"* ]] || { echo "[错误] 部署参数不能包含单引号" >&2; exit 1; }
done
[[ "$WORKSPACE_MONOLITH_WECOM_PROCESS_NAME" =~ ^[A-Za-z0-9._-]+$ ]] || {
  echo "[错误] WORKSPACE_MONOLITH_WECOM_PROCESS_NAME 不是安全的 PM2 名称" >&2
  exit 1
}

TEMPORARY_KEY=""
if [ -n "${KEY:-}" ]; then
  SSH_KEY=$KEY
elif [ -n "${KEY_CONTENT:-}" ]; then
  TEMPORARY_KEY="$(mktemp)"
  printf '%s\n' "$KEY_CONTENT" > "$TEMPORARY_KEY"
  chmod 600 "$TEMPORARY_KEY"
  SSH_KEY=$TEMPORARY_KEY
else
  echo "[错误] 需要 KEY 或 KEY_CONTENT" >&2
  exit 1
fi

SSH_CONTROL_DIRECTORY="$(mktemp -d)"
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

cleanup() {
  local exit_code=$?
  ssh "${SSH_OPTIONS[@]}" -O exit "$SERVER" >/dev/null 2>&1 || true
  rm -rf "$SSH_CONTROL_DIRECTORY"
  rm -f "$TEMPORARY_KEY"
  exit "$exit_code"
}
trap cleanup EXIT

ssh "${SSH_OPTIONS[@]}" -fN "$SERVER"
REMOTE_TOOL_ROOT="$REMOTE_DIR/.workspace/runtime/deploy-unit-tools"
ssh "${SSH_OPTIONS[@]}" "$SERVER" "mkdir -p '$REMOTE_TOOL_ROOT'"
rsync -az -e "$RSYNC_SSH" \
  ops/apply-deploy-unit.sh \
  ops/deploy-unit-sidecar.sh \
  ops/internal-unit-identity.mjs \
  ops/internal-rpc-deployment-guard.mjs \
  ops/switch-deploy-gateway.sh \
  ops/gateway-generation.mjs \
  ops/deploy-unit-release.mjs \
  ops/deploy-unit-provenance.mjs \
  ops/deploy-notification.mjs \
  ops/release-deploy-metadata.mjs \
  ops/deploy-profile-release.mjs \
  ops/deployment-profile-promotion.mjs \
  ops/deploy-fleet-observation.mjs \
  ops/deploy-fleet-status.mjs \
  ops/promote-deploy-profile.sh \
  ops/rollback-deploy-profile.sh \
  ops/assistant-runtime.mjs \
  ops/control-plane-receipt.mjs \
  ops/control-plane-requirements.mjs \
  ops/tenant-config-manifest.mjs \
  "$SERVER:$REMOTE_TOOL_ROOT/"
rsync -azR -e "$RSYNC_SSH" \
  ops/./release/contracts/deploy-unit-build-identity.mjs \
  ops/./release/readiness/artifact-inspection.mjs \
  "$SERVER:$REMOTE_TOOL_ROOT/"
ssh "${SSH_OPTIONS[@]}" "$SERVER" "
  chmod 700 '$REMOTE_TOOL_ROOT/apply-deploy-unit.sh' '$REMOTE_TOOL_ROOT/deploy-unit-sidecar.sh' '$REMOTE_TOOL_ROOT/switch-deploy-gateway.sh' '$REMOTE_TOOL_ROOT/promote-deploy-profile.sh' '$REMOTE_TOOL_ROOT/rollback-deploy-profile.sh'
  node --check '$REMOTE_TOOL_ROOT/gateway-generation.mjs'
  node --check '$REMOTE_TOOL_ROOT/internal-unit-identity.mjs'
  node --check '$REMOTE_TOOL_ROOT/internal-rpc-deployment-guard.mjs'
  node --check '$REMOTE_TOOL_ROOT/deploy-unit-release.mjs'
  node --check '$REMOTE_TOOL_ROOT/release/contracts/deploy-unit-build-identity.mjs'
  node --check '$REMOTE_TOOL_ROOT/release/readiness/artifact-inspection.mjs'
  node --check '$REMOTE_TOOL_ROOT/deploy-unit-provenance.mjs'
  node --check '$REMOTE_TOOL_ROOT/deploy-notification.mjs'
  node --check '$REMOTE_TOOL_ROOT/deploy-profile-release.mjs'
  node --check '$REMOTE_TOOL_ROOT/deployment-profile-promotion.mjs'
  node --check '$REMOTE_TOOL_ROOT/deploy-fleet-observation.mjs'
  node --check '$REMOTE_TOOL_ROOT/deploy-fleet-status.mjs'
  node --check '$REMOTE_TOOL_ROOT/assistant-runtime.mjs'
  bash -n '$REMOTE_TOOL_ROOT/apply-deploy-unit.sh'
  bash -n '$REMOTE_TOOL_ROOT/deploy-unit-sidecar.sh'
  bash -n '$REMOTE_TOOL_ROOT/switch-deploy-gateway.sh'
  bash -n '$REMOTE_TOOL_ROOT/promote-deploy-profile.sh'
  bash -n '$REMOTE_TOOL_ROOT/rollback-deploy-profile.sh'
"

if [ "$COMMAND" = "rollback" ]; then
  ssh "${SSH_OPTIONS[@]}" "$SERVER" \
    "REMOTE_DIR='$REMOTE_DIR' WORKSPACE_GATEWAY_NGINX_SITE='$WORKSPACE_GATEWAY_NGINX_SITE' WORKSPACE_MONOLITH_WECOM_PROCESS_NAME='$WORKSPACE_MONOLITH_WECOM_PROCESS_NAME' DEPLOY_PACKAGE_VERSION='$DEPLOY_PACKAGE_VERSION' DEPLOY_STARTED_EPOCH_SECONDS='$DEPLOY_STARTED_EPOCH_SECONDS' '$REMOTE_TOOL_ROOT/apply-deploy-unit.sh' rollback '$UNIT_ID'"
  exit 0
fi

OUTPUT_ROOT="${DEPLOY_UNIT_OUTPUT_ROOT:-.cache/deploy-units/$UNIT_ID}"
ARTIFACT_FILE="${DEPLOY_UNIT_ARTIFACT_PATH:-$OUTPUT_ROOT/$UNIT_ID-standalone.tgz}"
MANIFEST_FILE="${DEPLOY_UNIT_MANIFEST_PATH:-$OUTPUT_ROOT/$UNIT_ID-standalone.manifest.json}"
CONTRACT_FILE="$OUTPUT_ROOT/deploy-unit-contract.json"
GRAPH_FILE="$OUTPUT_ROOT/deploy-graph.json"
for file in "$ARTIFACT_FILE" "$MANIFEST_FILE" "$CONTRACT_FILE" "$GRAPH_FILE"; do
  [ -f "$file" ] || { echo "[错误] 缺少 unit build 输出: $file" >&2; exit 1; }
done
node ops/deploy-unit-release.mjs artifact-assert \
  --artifact "$ARTIFACT_FILE" --manifest "$MANIFEST_FILE" --contract "$CONTRACT_FILE" >/dev/null
GRAPH_DIGEST="$(node -e 'const m=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")); process.stdout.write(m.unit.graphSha256)' "$MANIFEST_FILE")"
node ops/gateway-generation.mjs graph-assert --graph "$GRAPH_FILE" --digest "$GRAPH_DIGEST" >/dev/null

MANIFEST_DIGEST="$(node -e 'const c=require("node:crypto"),f=require("node:fs"); process.stdout.write(c.createHash("sha256").update(f.readFileSync(process.argv[1])).digest("hex"))' "$MANIFEST_FILE")"
REMOTE_STAGING="$REMOTE_DIR/.workspace/deploy-unit-staging/$UNIT_ID-${MANIFEST_DIGEST:0:16}"
ssh "${SSH_OPTIONS[@]}" "$SERVER" "mkdir -p '$REMOTE_STAGING' && chmod 700 '$REMOTE_STAGING'"
rsync -az -e "$RSYNC_SSH" "$ARTIFACT_FILE" "$SERVER:$REMOTE_STAGING/artifact.tgz"
rsync -az -e "$RSYNC_SSH" "$MANIFEST_FILE" "$SERVER:$REMOTE_STAGING/artifact.manifest.json"
rsync -az -e "$RSYNC_SSH" "$CONTRACT_FILE" "$SERVER:$REMOTE_STAGING/deploy-unit-contract.json"
rsync -az -e "$RSYNC_SSH" "$GRAPH_FILE" "$SERVER:$REMOTE_STAGING/deploy-graph.json"
ssh "${SSH_OPTIONS[@]}" "$SERVER" \
  "REMOTE_DIR='$REMOTE_DIR' WORKSPACE_GATEWAY_NGINX_SITE='$WORKSPACE_GATEWAY_NGINX_SITE' WORKSPACE_MONOLITH_WECOM_PROCESS_NAME='$WORKSPACE_MONOLITH_WECOM_PROCESS_NAME' DEPLOY_PROFILE_PREPARED_STATE_ROOT='${DEPLOY_PROFILE_PREPARED_STATE_ROOT:-}' DEPLOY_PACKAGE_VERSION='$DEPLOY_PACKAGE_VERSION' DEPLOY_STARTED_EPOCH_SECONDS='$DEPLOY_STARTED_EPOCH_SECONDS' DEPLOY_RELEASE_PROCESS_SECONDS='$DEPLOY_RELEASE_PROCESS_SECONDS' DEPLOY_RELEASE_ATTEMPT_COUNT='$DEPLOY_RELEASE_ATTEMPT_COUNT' DEPLOY_RELEASE_PROCESS_STARTED_AT='$DEPLOY_RELEASE_PROCESS_STARTED_AT' DEPLOY_CNB_STAGES_BASE64='$DEPLOY_CNB_STAGES_BASE64' '$REMOTE_TOOL_ROOT/apply-deploy-unit.sh' deploy '$UNIT_ID' '$REMOTE_STAGING' '$MODE'"
ssh "${SSH_OPTIONS[@]}" "$SERVER" "rm -rf '$REMOTE_STAGING'"
