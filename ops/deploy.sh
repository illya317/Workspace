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

TMPKEY=$(mktemp)
printf '%s\n' "$KEY_CONTENT" > "$TMPKEY"
chmod 600 "$TMPKEY"
trap 'rm -f "$LOCKFILE" "$TMPKEY"' EXIT

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

echo "==> 本地构建..."
npm run build 2>&1 | tail -5

echo "==> 准备 standalone..."
cp -r public .next/standalone/ 2>/dev/null || true
cp -r .next/static .next/standalone/.next/ 2>/dev/null || true

echo "==> 同步 standalone 到服务器..."
ssh -i "$TMPKEY" "$SERVER" "mkdir -p $DEPLOY_DIR"
rsync -avz -e "ssh -i $TMPKEY" \
  --exclude='*.map' \
  .next/standalone/ "$SERVER:$DEPLOY_DIR/"

echo ""
echo "==> 重启服务..."
ssh -i "$TMPKEY" "$SERVER" "
  cd $DEPLOY_DIR
  echo '==> 安装依赖（重建 native 模块）...'
  npm install 2>&1 | tail -3

  sed -i \"s|file:.*/data/dev.db|file:$REMOTE_DIR/data/dev.db|\" .env 2>/dev/null || true
  pm2 restart $PM2_NAME --update-env 2>/dev/null || pm2 start server.js --name $PM2_NAME --cwd $DEPLOY_DIR --env production
  pm2 save
  pm2 status
"

echo ""
echo "==> 部署完成！"
