#!/bin/bash
set -e

cd "$(dirname "$0")/.."
source ops/server.env.sh

LOCKFILE=".deploying"

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
  --exclude='data/dev.db' \
  --exclude='public/company/' \
  --exclude='.DS_Store' \
  ./ "$SERVER:$REMOTE_DIR/"

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
  cp -r public .next/standalone/public
  rm -rf .next/standalone/data
  cp -r data .next/standalone/data

  pm2 delete $PM2_NAME 2>/dev/null || true
  cd .next/standalone
  pm2 start server.js --name $PM2_NAME --cwd $REMOTE_DIR/.next/standalone
  pm2 save
  pm2 status
"

echo ""
echo "==> 部署完成！"
