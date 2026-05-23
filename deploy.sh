#!/bin/bash
set -e

SERVER="ubuntu@49.235.213.225"
REMOTE_DIR="/home/ubuntu/weekly"
PM2_NAME="weekly"
KEY="/Users/koito/Desktop/.System/tencent/fenghua.pem"
PUSH_DB=false
LOCKFILE=".deploying"

# 锁文件：防止多 Agent 同时部署
if [ -f "$LOCKFILE" ]; then
  echo "[错误] 检测到 $LOCKFILE，可能另一个部署正在进行。"
  echo "如果确认没有正在进行的部署，可以手动删除：rm $LOCKFILE"
  exit 1
fi

touch "$LOCKFILE"
trap 'rm -f "$LOCKFILE"' EXIT

# 解析参数
for arg in "$@"; do
  case $arg in
    --push-db)
      PUSH_DB=true
      shift
      ;;
  esac
done

if [ "$PUSH_DB" = true ]; then
  echo "==> 同步数据库 schema..."
  TMP_DB="/tmp/server-dev-push-$RANDOM.db"
  rsync -avz -e "ssh -i $KEY" "$SERVER:$REMOTE_DIR/prisma/dev.db" "$TMP_DB"
  DATABASE_URL="file:$TMP_DB" npx prisma db push --accept-data-loss --skip-generate
  rsync -avz -e "ssh -i $KEY" "$TMP_DB" "$SERVER:$REMOTE_DIR/prisma/dev.db"
  rm -f "$TMP_DB"
  echo "==> Schema 同步完成"
fi

echo "==> 本地构建..."
npm run build

echo "==> 复制静态资源到 standalone（Next.js standalone 需要）..."
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/

echo "==> 复制 Prisma 生成文件到 standalone..."
mkdir -p .next/standalone/node_modules/.prisma
cp -r node_modules/.prisma/client .next/standalone/node_modules/.prisma/

echo "==> 确保服务器数据库目录存在..."
ssh -i "$KEY" "$SERVER" "mkdir -p $REMOTE_DIR/prisma"

echo "==> 同步构建产物到服务器（rsync 只传差异）..."
rsync -avz --delete --exclude='.env' -e "ssh -i $KEY" \
  .next/standalone/ "$SERVER:$REMOTE_DIR/.next/standalone/"

echo "==> 修复服务器 .env 数据库路径..."
ssh -i "$KEY" "$SERVER" "sed -i 's|file:/Users/koito/Desktop/Project/[^/]*/prisma/dev.db|file:/home/ubuntu/weekly/prisma/dev.db|' $REMOTE_DIR/.next/standalone/.env 2>/dev/null || true"

echo "==> 重启服务..."
ssh -i "$KEY" "$SERVER" "cd $REMOTE_DIR/.next/standalone && pm2 restart $PM2_NAME || pm2 start server.js --name $PM2_NAME --cwd $REMOTE_DIR/.next/standalone"

echo "==> 完成"
