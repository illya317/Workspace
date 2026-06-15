#!/bin/bash
set -e

cd "$(dirname "$0")/.."
source ops/server.env.sh

LOCKFILE=".deploying"
LOCAL_WORKSPACE_CONFIG_DIR="${LOCAL_WORKSPACE_CONFIG_DIR:-${WORKSPACE_CONFIG_DIR:-$HOME/.workspace}}"
LOCAL_WORKSPACE_BACKUP_DIR_CONFIGURED="${LOCAL_WORKSPACE_BACKUP_DIR:-}"
REMOTE_WORKSPACE_CONFIG_DIR="${REMOTE_WORKSPACE_CONFIG_DIR:-$(dirname "$REMOTE_DIR")/.workspace}"
REMOTE_WORKSPACE_BACKUP_DIR="${REMOTE_WORKSPACE_BACKUP_DIR:-$REMOTE_WORKSPACE_CONFIG_DIR.backups}"

if [ ! -d "$LOCAL_WORKSPACE_CONFIG_DIR" ]; then
  echo "[错误] 本地运行态配置目录不存在：$LOCAL_WORKSPACE_CONFIG_DIR"
  exit 1
fi

LOCAL_WORKSPACE_CONFIG_DIR="$(cd "$LOCAL_WORKSPACE_CONFIG_DIR" && pwd -P)"
LOCAL_WORKSPACE_BACKUP_DIR="${LOCAL_WORKSPACE_BACKUP_DIR_CONFIGURED:-$(dirname "$LOCAL_WORKSPACE_CONFIG_DIR")/.workspace.backups}"

if [ -f "$LOCKFILE" ]; then
  echo "[错误] 检测到 $LOCKFILE，可能另一个部署正在进行。"
  echo "如果确认没有正在进行的部署，可以手动删除：rm $LOCKFILE"
  exit 1
fi

touch "$LOCKFILE"

TMPKEY=""
if [ -n "${KEY_CONTENT:-}" ]; then
  TMPKEY=$(mktemp)
  printf '%s\n' "$KEY_CONTENT" > "$TMPKEY"
  chmod 600 "$TMPKEY"
  SSH_KEY="$TMPKEY"
elif [ -n "${KEY:-}" ]; then
  SSH_KEY="$KEY"
else
  echo "[错误] ops/server.env.sh 必须配置 KEY_CONTENT 或 KEY"
  exit 1
fi
trap 'rm -f "$LOCKFILE" ${TMPKEY:+"$TMPKEY"}' EXIT

ssh_cmd() {
  ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$SERVER" "$@"
}

local_pkg_hash() {
  cat package.json package-lock.json | shasum -a 256 | awk '{print $1}'
}

remote_pkg_hash() {
  ssh_cmd "
    cd $REMOTE_DIR 2>/dev/null || exit 0
    [ -f package.json ] && [ -f package-lock.json ] || exit 0
    cat package.json package-lock.json | sha256sum | awk '{print \\\$1}'
  " 2>/dev/null || true
}

if [ "$(git branch --show-current)" != "main" ]; then
  echo "[错误] 必须在 main 分支部署，当前分支：$(git branch --show-current)"
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "[错误] 存在未提交的修改，请先 commit"
  git status --short
  exit 1
fi

echo "==> 类型检查..."
npx tsc --noEmit

LOCAL_PKG_HASH="$(local_pkg_hash)"
REMOTE_PKG_HASH="$(remote_pkg_hash)"
if [ "$LOCAL_PKG_HASH" != "$REMOTE_PKG_HASH" ]; then
  NEED_NPM_CI=1
  echo "==> 检测到依赖清单变化，本次会执行 npm ci"
else
  NEED_NPM_CI=0
  echo "==> 依赖清单未变化，跳过 npm ci"
fi

echo "==> 同步源码到服务器..."
ssh_cmd "mkdir -p $REMOTE_DIR"
rsync -az --delete -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=accept-new" \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='.next/' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='data/' \
  --exclude='public/company' \
  --exclude='public/company/' \
  --exclude='.DS_Store' \
  ./ "$SERVER:$REMOTE_DIR/"

echo "==> 同步运行态配置到服务器..."
ssh_cmd "
  set -e
  if [ -d '$REMOTE_WORKSPACE_CONFIG_DIR' ]; then
    mkdir -p '$REMOTE_WORKSPACE_BACKUP_DIR'
    TS=\$(date +%Y%m%d%H%M%S)
    [ -f '$REMOTE_WORKSPACE_CONFIG_DIR/.env' ] && cp '$REMOTE_WORKSPACE_CONFIG_DIR/.env' '$REMOTE_WORKSPACE_BACKUP_DIR/.env.'\$TS || true
  fi
  mkdir -p '$REMOTE_WORKSPACE_CONFIG_DIR/data'
"
rsync -az --delete -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=accept-new" \
  --exclude='data/' \
  --exclude='.DS_Store' \
  "$LOCAL_WORKSPACE_CONFIG_DIR/" "$SERVER:$REMOTE_WORKSPACE_CONFIG_DIR/"
ssh_cmd "
  set -e
  cd '$REMOTE_DIR'
  ln -sfn '$REMOTE_WORKSPACE_CONFIG_DIR/.env' .env
  mkdir -p public
  if [ -d '$REMOTE_WORKSPACE_CONFIG_DIR/assets/brand/company' ]; then
    rm -rf public/company
    ln -sfn '$REMOTE_WORKSPACE_CONFIG_DIR/assets/brand/company' public/company
  fi
  if [ -f '$REMOTE_WORKSPACE_CONFIG_DIR/.env' ]; then
    python3 - <<'PY'
from pathlib import Path
import re

env_path = Path('$REMOTE_WORKSPACE_CONFIG_DIR/.env')
text = env_path.read_text()
replacements = {
    'DATABASE_URL': '\"file:$REMOTE_WORKSPACE_CONFIG_DIR/data/dev.db\"',
    'WORKSPACE_CONFIG_DIR': '$REMOTE_WORKSPACE_CONFIG_DIR',
}
for key, value in replacements.items():
    line = f'{key}={value}'
    if re.search(rf'^{key}=.*$', text, flags=re.M):
        text = re.sub(rf'^{key}=.*$', line, text, flags=re.M)
    else:
        text = text.rstrip() + '\\n' + line + '\\n'
env_path.write_text(text)
PY
  fi
"
echo "==> 拉取服务器 data 到本地..."
LOCAL_DATA_DIR="$LOCAL_WORKSPACE_CONFIG_DIR/data"
if [ -d "$LOCAL_DATA_DIR" ]; then
  TS="$(date +%Y%m%d%H%M%S)"
  mkdir -p "$LOCAL_WORKSPACE_BACKUP_DIR"
  cp -R "$LOCAL_DATA_DIR" "$LOCAL_WORKSPACE_BACKUP_DIR/data.$TS"
fi
mkdir -p "$LOCAL_DATA_DIR"
rsync -az --delete -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=accept-new" \
  "$SERVER:$REMOTE_WORKSPACE_CONFIG_DIR/data/" "$LOCAL_DATA_DIR/"

echo ""
echo "==> 服务器构建并重启服务..."
ssh_cmd "
  set -e
  cd $REMOTE_DIR
  if [ '$NEED_NPM_CI' = '1' ] || [ ! -d node_modules ]; then
    echo '==> 安装依赖...'
    npm ci
  else
    echo '==> 跳过 npm ci，复用服务器 node_modules'
  fi

  npm run build

  rm -rf .next/standalone/.next/static
  cp -r .next/static .next/standalone/.next/static
  rm -rf .next/standalone/public
  cp -rL public .next/standalone/public
  rm -rf .next/standalone/data
  if [ -d data ]; then
    cp -r data .next/standalone/data
  else
    mkdir -p .next/standalone/data
  fi

  pm2 delete $PM2_NAME 2>/dev/null || true
  cd .next/standalone
  pm2 start server.js --name $PM2_NAME --cwd $REMOTE_DIR/.next/standalone
  pm2 save
  pm2 status
"

echo ""
echo "==> 部署完成！"
