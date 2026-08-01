#!/usr/bin/env bash
# shellcheck disable=SC2029
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

COMMAND="${1:-}"
SERVER="${SERVER:-}"
REMOTE_DIR="${REMOTE_DIR:-}"
WORKSPACE_GATEWAY_NGINX_SITE="${WORKSPACE_GATEWAY_NGINX_SITE:-}"
DEPLOY_STARTED_EPOCH_SECONDS="${DEPLOY_STARTED_EPOCH_SECONDS:-$(date +%s)}"
DEPLOY_PACKAGE_VERSION="${DEPLOY_PACKAGE_VERSION:-$(node -p "require('./package.json').version")}"
if [ "$COMMAND" != "promote" ] && [ "$COMMAND" != "rollback" ]; then
  echo "用法: $0 promote <profile> <release> <rollout> <observation> <graph> <prepared-state-root> | rollback <receipt>" >&2
  exit 2
fi
[ "${DEPLOY_UNIT_TRUSTED_BUILD:-0}" = "1" ] || {
  echo "[错误] Profile promotion/rollback 只能由可信发布环境调用" >&2
  exit 1
}
[ -n "$SERVER" ] || { echo "[错误] 缺少 SERVER" >&2; exit 1; }
[ -n "$REMOTE_DIR" ] && [ "${REMOTE_DIR#/}" != "$REMOTE_DIR" ] || { echo "[错误] REMOTE_DIR 必须是绝对路径" >&2; exit 1; }

if [ "$COMMAND" = "promote" ]; then
  [ "$#" -eq 7 ] || { echo "[错误] promote 参数不完整" >&2; exit 2; }
  PROFILE_FILE=$2
  RELEASE_FILE=$3
  ROLLOUT_FILE=$4
  OBSERVATION_FILE=$5
  GRAPH_FILE=$6
  PREPARED_STATE_ROOT=$7
  for file in "$PROFILE_FILE" "$RELEASE_FILE" "$ROLLOUT_FILE" "$OBSERVATION_FILE" "$GRAPH_FILE"; do
    [ -f "$file" ] || { echo "[错误] Profile promotion 输入不存在: $file" >&2; exit 1; }
  done
  [ "${PREPARED_STATE_ROOT#/}" != "$PREPARED_STATE_ROOT" ] || { echo "[错误] prepared-state-root 必须是远端绝对路径" >&2; exit 2; }
else
  [ "$#" -eq 2 ] && [ -f "$2" ] || { echo "[错误] rollback 需要 promotion receipt" >&2; exit 2; }
  RECEIPT_FILE=$2
  PREPARED_STATE_ROOT=""
fi
for value in "$SERVER" "$REMOTE_DIR" "$WORKSPACE_GATEWAY_NGINX_SITE" "$PREPARED_STATE_ROOT"; do
  [[ "$value" != *"'"* ]] || { echo "[错误] 部署参数不能包含单引号" >&2; exit 1; }
done

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
SSH_OPTIONS=(-i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=15 -o ConnectionAttempts=1 -o StrictHostKeyChecking=accept-new -o ControlMaster=auto -o ControlPersist=600 -o "ControlPath=$SSH_CONTROL_PATH")
RSYNC_SSH="ssh -i $SSH_KEY -o BatchMode=yes -o ConnectTimeout=15 -o ConnectionAttempts=1 -o StrictHostKeyChecking=accept-new -o ControlMaster=auto -o ControlPersist=600 -o ControlPath=$SSH_CONTROL_PATH"
DEPLOY_TOOL_BUNDLE_TMP=""
cleanup() {
  local exit_code=$?
  ssh "${SSH_OPTIONS[@]}" -O exit "$SERVER" >/dev/null 2>&1 || true
  rm -rf "$SSH_CONTROL_DIRECTORY"
  rm -f "$TEMPORARY_KEY"
  if [ -n "$DEPLOY_TOOL_BUNDLE_TMP" ]; then
    rm -rf "$DEPLOY_TOOL_BUNDLE_TMP"
  fi
  exit "$exit_code"
}
trap cleanup EXIT
ssh "${SSH_OPTIONS[@]}" -fN "$SERVER"

REMOTE_TOOL_ROOT="$REMOTE_DIR/.workspace/runtime/deploy-unit-tools"
DEPLOY_TOOL_BUNDLE_TMP="$(mktemp -d "${TMPDIR:-/tmp}/workspace-deploy-unit-tools.XXXXXX")"
node ops/release/control/deploy-tool-bundle.mjs build \
  --repository "$PROJECT_ROOT" \
  --output "$DEPLOY_TOOL_BUNDLE_TMP" \
  --profile deploy-unit-tools >/dev/null
node ops/release/control/deploy-tool-bundle.mjs verify \
  --bundle "$DEPLOY_TOOL_BUNDLE_TMP" >/dev/null
ssh "${SSH_OPTIONS[@]}" "$SERVER" "mkdir -p '$REMOTE_TOOL_ROOT'"
rsync -az --delete-delay -e "$RSYNC_SSH" \
  "$DEPLOY_TOOL_BUNDLE_TMP/" "$SERVER:$REMOTE_TOOL_ROOT/"
ssh "${SSH_OPTIONS[@]}" "$SERVER" \
  "node '$REMOTE_TOOL_ROOT/release/control/deploy-tool-bundle.mjs' verify --bundle '$REMOTE_TOOL_ROOT' >/dev/null"
rm -rf "$DEPLOY_TOOL_BUNDLE_TMP"
DEPLOY_TOOL_BUNDLE_TMP=""

if [ "$COMMAND" = "promote" ]; then
  DIGEST_INPUTS=("$PROFILE_FILE" "$RELEASE_FILE" "$ROLLOUT_FILE" "$OBSERVATION_FILE" "$GRAPH_FILE")
else
  DIGEST_INPUTS=("$RECEIPT_FILE")
fi
INPUT_DIGEST="$(node -e '
  const crypto = require("node:crypto");
  const fs = require("node:fs");
  const hash = crypto.createHash("sha256");
  for (const [index, file] of process.argv.slice(1).entries()) {
    const content = fs.readFileSync(file);
    hash.update(String(index) + ":" + String(content.length) + ":");
    hash.update(content);
  }
  process.stdout.write(hash.digest("hex"));
' "${DIGEST_INPUTS[@]}")"
REMOTE_STAGING="$REMOTE_DIR/.workspace/profile-staging/$INPUT_DIGEST"
ssh "${SSH_OPTIONS[@]}" "$SERVER" "mkdir -p '$REMOTE_STAGING' && chmod 700 '$REMOTE_STAGING'"

if [ "$COMMAND" = "rollback" ]; then
  rsync -az -e "$RSYNC_SSH" "$RECEIPT_FILE" "$SERVER:$REMOTE_STAGING/promotion.receipt.json"
  ssh "${SSH_OPTIONS[@]}" "$SERVER" "REMOTE_DIR='$REMOTE_DIR' WORKSPACE_GATEWAY_NGINX_SITE='$WORKSPACE_GATEWAY_NGINX_SITE' '$REMOTE_TOOL_ROOT/rollback-deploy-profile.sh' '$REMOTE_STAGING/promotion.receipt.json'"
else
  rsync -az -e "$RSYNC_SSH" "$PROFILE_FILE" "$SERVER:$REMOTE_STAGING/profile.json"
  rsync -az -e "$RSYNC_SSH" "$RELEASE_FILE" "$SERVER:$REMOTE_STAGING/release.json"
  rsync -az -e "$RSYNC_SSH" "$ROLLOUT_FILE" "$SERVER:$REMOTE_STAGING/rollout.json"
  rsync -az -e "$RSYNC_SSH" "$OBSERVATION_FILE" "$SERVER:$REMOTE_STAGING/observation.json"
  rsync -az -e "$RSYNC_SSH" "$GRAPH_FILE" "$SERVER:$REMOTE_STAGING/deploy-graph.json"
  ssh "${SSH_OPTIONS[@]}" "$SERVER" "REMOTE_DIR='$REMOTE_DIR' WORKSPACE_GATEWAY_NGINX_SITE='$WORKSPACE_GATEWAY_NGINX_SITE' DEPLOY_PACKAGE_VERSION='$DEPLOY_PACKAGE_VERSION' DEPLOY_STARTED_EPOCH_SECONDS='$DEPLOY_STARTED_EPOCH_SECONDS' '$REMOTE_TOOL_ROOT/promote-deploy-profile.sh' '$REMOTE_STAGING/profile.json' '$REMOTE_STAGING/release.json' '$REMOTE_STAGING/rollout.json' '$REMOTE_STAGING/observation.json' '$REMOTE_STAGING/deploy-graph.json' '$PREPARED_STATE_ROOT'"
fi
ssh "${SSH_OPTIONS[@]}" "$SERVER" "rm -rf '$REMOTE_STAGING'"
