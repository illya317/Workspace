#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

usage() {
  cat <<'EOF'
用法:
  npm run workspace:pull -- [选项]
  bash ops/sync-runtime-from-server.sh [选项]

选项:
  --dry-run     只显示会同步什么，不实际写入本地
  --assets      同时拉取 assets/，默认只拉 data/
  --no-delete   不删除本地多余文件，默认按服务器镜像清理 data/
  --no-check    同步后不运行 npm run workspace:check
  --no-public   不刷新本地 public 里的 logo/avatar 预览资产
EOF
}

DRY_RUN=0
INCLUDE_ASSETS=0
DELETE_REMOTE_REMOVED=1
RUN_WORKSPACE_CHECK="${RUN_WORKSPACE_CHECK:-1}"
SYNC_PUBLIC_ASSETS=1

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --assets) INCLUDE_ASSETS=1 ;;
    --no-delete) DELETE_REMOTE_REMOVED=0 ;;
    --no-check) RUN_WORKSPACE_CHECK=0 ;;
    --no-public) SYNC_PUBLIC_ASSETS=0 ;;
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
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
BACKUP_RETENTION_COUNT="${BACKUP_RETENTION_COUNT:-20}"

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

if [ ! -d "$LOCAL_WORKSPACE_CONFIG_DIR" ]; then
  echo "[错误] 本地运行态目录不存在: $LOCAL_WORKSPACE_CONFIG_DIR"
  exit 1
fi

LOCAL_WORKSPACE_CONFIG_DIR="$(cd "$LOCAL_WORKSPACE_CONFIG_DIR" && pwd -P)"
LOCAL_WORKSPACE_BACKUP_DIR="${LOCAL_WORKSPACE_BACKUP_DIR:-$(dirname "$LOCAL_WORKSPACE_CONFIG_DIR")/.workspace.backups}"

case "$BACKUP_RETENTION_DAYS" in
  ''|*[!0-9]*) echo "[错误] BACKUP_RETENTION_DAYS 必须是非负整数"; exit 1 ;;
esac
case "$BACKUP_RETENTION_COUNT" in
  ''|*[!0-9]*) echo "[错误] BACKUP_RETENTION_COUNT 必须是非负整数"; exit 1 ;;
esac
if [ "$BACKUP_RETENTION_COUNT" -lt 1 ]; then
  echo "[错误] BACKUP_RETENTION_COUNT 必须至少为 1，避免删除本次同步备份"
  exit 1
fi

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

ssh_cmd() {
  ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$SERVER" "$@"
}

relative_link_target() {
  python3 - "$1" "$2" <<'PY'
import os
import sys

print(os.path.relpath(sys.argv[1], os.path.dirname(sys.argv[2])))
PY
}

cleanup_local_backups() {
  python3 - "$LOCAL_WORKSPACE_BACKUP_DIR" "$BACKUP_RETENTION_DAYS" "$BACKUP_RETENTION_COUNT" <<'PY'
from pathlib import Path
import sys
import time

backup_dir = Path(sys.argv[1])
retention_days = int(sys.argv[2])
retention_count = int(sys.argv[3])
cutoff = time.time() - retention_days * 86400
files = sorted(
    backup_dir.glob('workspace-runtime-before-pull-*.tgz'),
    key=lambda path: path.stat().st_mtime,
    reverse=True,
)
for index, path in enumerate(files):
    too_many = index >= retention_count
    too_old = retention_days > 0 and path.stat().st_mtime < cutoff
    if too_many or too_old:
        path.unlink()
print(f'Local runtime backups kept: {len(list(backup_dir.glob("workspace-runtime-before-pull-*.tgz")))}')
PY
}

rsync_ssh=(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new)
rsync_flags=(-az --stats --progress)
if [ "$DELETE_REMOTE_REMOVED" = "1" ]; then
  rsync_flags+=(--delete)
fi
if [ "$DRY_RUN" = "1" ]; then
  rsync_flags+=(--dry-run)
fi

echo "==> 生产服务器: $SERVER"
echo "==> 远端运行态: $REMOTE_WORKSPACE_CONFIG_DIR"
echo "==> 本地运行态: $LOCAL_WORKSPACE_CONFIG_DIR"

echo "==> 校验远端 data..."
ssh_cmd "set -e; test -d '$REMOTE_WORKSPACE_CONFIG_DIR/data'; test -f '$REMOTE_WORKSPACE_CONFIG_DIR/data/dev.db'; ls -lh '$REMOTE_WORKSPACE_CONFIG_DIR/data/dev.db'"

if [ "$DRY_RUN" = "0" ]; then
  stamp="$(date +%Y%m%d%H%M%S)"
  mkdir -p "$LOCAL_WORKSPACE_BACKUP_DIR"
  backup="$LOCAL_WORKSPACE_BACKUP_DIR/workspace-runtime-before-pull-$stamp.tgz"
  echo "==> 备份本地运行态: $backup"
  tar -C "$(dirname "$LOCAL_WORKSPACE_CONFIG_DIR")" -czf "$backup" "$(basename "$LOCAL_WORKSPACE_CONFIG_DIR")"
  ls -lh "$backup"
  echo "==> 清理本地运行态备份（保留 ${BACKUP_RETENTION_DAYS} 天，最多 ${BACKUP_RETENTION_COUNT} 份）..."
  cleanup_local_backups
else
  echo "==> dry-run：跳过本地备份写入"
fi

mkdir -p "$LOCAL_WORKSPACE_CONFIG_DIR/data"
echo "==> 从服务器同步 data/ 到本地..."
rsync "${rsync_flags[@]}" -e "${rsync_ssh[*]}" \
  "$SERVER:$REMOTE_WORKSPACE_CONFIG_DIR/data/" \
  "$LOCAL_WORKSPACE_CONFIG_DIR/data/"

if [ "$INCLUDE_ASSETS" = "1" ]; then
  mkdir -p "$LOCAL_WORKSPACE_CONFIG_DIR/assets"
  echo "==> 从服务器同步 assets/ 到本地..."
  rsync "${rsync_flags[@]}" -e "${rsync_ssh[*]}" \
    "$SERVER:$REMOTE_WORKSPACE_CONFIG_DIR/assets/" \
    "$LOCAL_WORKSPACE_CONFIG_DIR/assets/"
fi

if [ "$DRY_RUN" = "0" ] && [ "$SYNC_PUBLIC_ASSETS" = "1" ]; then
  echo "==> 链接本地 public 预览资产..."
  rm -rf public/company public/assets/agent/avatar public/assets/user/avatar
  mkdir -p public/assets/agent public/assets/user
  ln -s "$(relative_link_target "$LOCAL_WORKSPACE_CONFIG_DIR/assets/brand/company" public/company)" public/company
  ln -s "$(relative_link_target "$LOCAL_WORKSPACE_CONFIG_DIR/assets/agent/avatar" public/assets/agent/avatar)" public/assets/agent/avatar
  ln -s "$(relative_link_target "$LOCAL_WORKSPACE_CONFIG_DIR/assets/user/avatar" public/assets/user/avatar)" public/assets/user/avatar
fi

if [ "$DRY_RUN" = "0" ] && [ "$RUN_WORKSPACE_CHECK" = "1" ]; then
  echo "==> 校验本地运行态..."
  npm run workspace:check
fi

echo "==> 服务器运行态拉取完成"
