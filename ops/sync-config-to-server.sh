#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

usage() {
  cat <<'EOF'
用法:
  npm run workspace:push-config -- [选项]
  bash ops/sync-config-to-server.sh [选项]

选项:
  --dry-run     只显示会同步什么，不实际写入服务器
  --no-delete   不删除服务器上已被本地删除的配置文件
EOF
}

DRY_RUN=0
DELETE_REMOTE_REMOVED=1

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --no-delete) DELETE_REMOTE_REMOVED=0 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "[错误] 未知参数: $1"; usage; exit 1 ;;
  esac
  shift
done

if [ -f ops/server.env.sh ]; then
  # shellcheck source=/dev/null
  source ops/server.env.sh
fi

target_value() {
  node -e "const t=require('./ops/deploy-targets.json').production||{}; console.log(t[process.argv[1]]||'')" "$1"
}

TARGET_HOST="$(target_value serverHost)"
TARGET_REMOTE_DIR="$(target_value remoteDir)"
TARGET_WORKSPACE_CONFIG_DIR="$(target_value workspaceConfigDir)"
DEFAULT_LOCAL_WORKSPACE_CONFIG_DIR="$(cd .. && pwd -P)/.workspace"

SERVER="${SERVER:-}"
REMOTE_DIR="${REMOTE_DIR:-$TARGET_REMOTE_DIR}"
REMOTE_WORKSPACE_CONFIG_DIR="${REMOTE_WORKSPACE_CONFIG_DIR:-$TARGET_WORKSPACE_CONFIG_DIR}"
LOCAL_WORKSPACE_CONFIG_DIR="${LOCAL_WORKSPACE_CONFIG_DIR:-${WORKSPACE_CONFIG_DIR:-$DEFAULT_LOCAL_WORKSPACE_CONFIG_DIR}}"

if [ -z "$SERVER" ]; then
  echo "[错误] 缺少 SERVER。请配置 ops/server.env.sh 或环境变量 SERVER。"
  exit 1
fi

if [ -z "$REMOTE_DIR" ]; then
  echo "[错误] 缺少 REMOTE_DIR，且 ops/deploy-targets.json 未提供 production.remoteDir。"
  exit 1
fi

if [ -z "$REMOTE_WORKSPACE_CONFIG_DIR" ]; then
  REMOTE_WORKSPACE_CONFIG_DIR="$REMOTE_DIR/.workspace"
fi

if [ "$REMOTE_WORKSPACE_CONFIG_DIR" != "$REMOTE_DIR/.workspace" ]; then
  echo "[警告] REMOTE_WORKSPACE_CONFIG_DIR 已统一为 $REMOTE_DIR/.workspace，忽略旧值: $REMOTE_WORKSPACE_CONFIG_DIR"
  REMOTE_WORKSPACE_CONFIG_DIR="$REMOTE_DIR/.workspace"
fi

LOCAL_CONFIG_ROOT="$LOCAL_WORKSPACE_CONFIG_DIR/config/pharma-qc"
if [ ! -d "$LOCAL_CONFIG_ROOT" ]; then
  echo "[错误] 本地 pharma-qc 配置目录不存在: $LOCAL_CONFIG_ROOT"
  exit 1
fi

LOCAL_WORKSPACE_CONFIG_DIR="$(cd "$LOCAL_WORKSPACE_CONFIG_DIR" && pwd -P)"

server_host="${SERVER#*@}"
server_host="${server_host%%:*}"
if [ -n "$TARGET_HOST" ] && [ "$server_host" != "$TARGET_HOST" ]; then
  echo "[错误] SERVER 指向 $server_host，但 production 目标是 $TARGET_HOST。"
  exit 1
fi

if [ -n "$TARGET_REMOTE_DIR" ] && [ "$REMOTE_DIR" != "$TARGET_REMOTE_DIR" ]; then
  echo "[错误] REMOTE_DIR 是 $REMOTE_DIR，但 production 目标是 $TARGET_REMOTE_DIR。"
  exit 1
fi

TMPKEY=""
if [ -n "${KEY:-}" ]; then
  SSH_KEY="$KEY"
elif [ -n "${KEY_CONTENT:-}" ]; then
  TMPKEY="$(mktemp)"
  printf '%s\n' "$KEY_CONTENT" > "$TMPKEY"
  chmod 600 "$TMPKEY"
  SSH_KEY="$TMPKEY"
else
  echo "[错误] 缺少 SSH 密钥。请设置 KEY 或 KEY_CONTENT。"
  exit 1
fi
trap 'rm -f "${TMPKEY:-}"' EXIT

rsync_flags=(-az --stats --progress)
if [ "$DELETE_REMOTE_REMOVED" = "1" ]; then
  rsync_flags+=(--delete)
fi
if [ "$DRY_RUN" = "1" ]; then
  rsync_flags+=(--dry-run)
fi

echo "==> 生产服务器: $SERVER"
echo "==> 本地配置: $LOCAL_CONFIG_ROOT"
echo "==> 远端配置: $REMOTE_WORKSPACE_CONFIG_DIR/config/pharma-qc"

if [ "$DRY_RUN" = "0" ]; then
  echo "==> 生成本地 QC 模板缓存..."
  WORKSPACE_CONFIG_DIR="$LOCAL_WORKSPACE_CONFIG_DIR" npm run qc:cache:build
fi

ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$SERVER" \
  "mkdir -p '$REMOTE_WORKSPACE_CONFIG_DIR/config/pharma-qc' '$REMOTE_WORKSPACE_CONFIG_DIR/cache/production/qc'"

rsync "${rsync_flags[@]}" -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=accept-new" \
  "$LOCAL_CONFIG_ROOT/" \
  "$SERVER:$REMOTE_WORKSPACE_CONFIG_DIR/config/pharma-qc/"

if [ "$DRY_RUN" = "0" ] && [ -d "$LOCAL_WORKSPACE_CONFIG_DIR/cache/production/qc" ]; then
  rsync -az --delete -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=accept-new" \
    "$LOCAL_WORKSPACE_CONFIG_DIR/cache/production/qc/" \
    "$SERVER:$REMOTE_WORKSPACE_CONFIG_DIR/cache/production/qc/"
fi

if [ "$DRY_RUN" = "0" ]; then
  ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$SERVER" "
    set -e
    test -f '$REMOTE_WORKSPACE_CONFIG_DIR/config/pharma-qc/product_stage_tests.json'
    test -d '$REMOTE_WORKSPACE_CONFIG_DIR/config/pharma-qc/full'
    test -d '$REMOTE_WORKSPACE_CONFIG_DIR/config/pharma-qc/records'
  "
fi

echo "==> pharma-qc 配置同步完成"
