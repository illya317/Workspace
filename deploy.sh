#!/bin/bash
set -e

SERVER="ubuntu@49.235.213.225"
REMOTE_DIR="/home/ubuntu/weekly"
PM2_NAME="weekly"
KEY="/Users/koito/Desktop/.System/tencent/fenghua.pem"
PUSH_DB=false
LOCKFILE=".deploying"

# 分支检查：必须在 main 分支部署
if [ "$(git branch --show-current)" != "main" ]; then
  echo "[错误] 必须在 main 分支部署，当前分支：$(git branch --show-current)"
  exit 1
fi

# 未提交修改检查（必须在锁文件之前，否则 .deploying 会被视为未跟踪文件）
if [ -n "$(git status --porcelain)" ]; then
  echo "[错误] 存在未提交的修改，请先 commit"
  git status --short
  exit 1
fi

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
  DATABASE_URL="file:$TMP_DB" npx prisma db push --accept-data-loss
  rsync -avz -e "ssh -i $KEY" "$TMP_DB" "$SERVER:$REMOTE_DIR/prisma/dev.db"
  rm -f "$TMP_DB"
  echo "==> Schema 同步完成"
fi

echo "==> 运行 lint (max-warnings=0)..."
npm run lint -- --max-warnings=0

echo "==> 运行类型检查..."
npx tsc --noEmit

echo "==> 本地构建..."
npm run build

echo "==> 复制静态资源到 standalone（Next.js standalone 需要）..."
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/

echo "==> 复制 Prisma 生成文件到 standalone..."
mkdir -p .next/standalone/node_modules/.prisma
cp -r node_modules/.prisma/client .next/standalone/node_modules/.prisma/

echo "==> 清理 Prisma 重复文件和本地引擎（只保留服务器需要的 debian-openssl）..."
find .next/standalone/node_modules/.prisma/client -regextype sed -regex '.* [2-9][0-9]*\.\(js\|ts\|node\)$' -delete 2>/dev/null || true
rm -f .next/standalone/node_modules/.prisma/client/libquery_engine-darwin-arm64* 2>/dev/null || true

echo "==> 确保服务器数据库目录存在..."
ssh -i "$KEY" "$SERVER" "mkdir -p $REMOTE_DIR/prisma"

echo "==> 同步构建产物到服务器（rsync 只传差异，node_modules 在服务器端自行安装）..."
rsync -avz --delete --exclude='.env' -e "ssh -i $KEY" \
  .next/standalone/ "$SERVER:$REMOTE_DIR/.next/standalone/"

echo "==> 同步 Prisma schema 到服务器..."
rsync -avz --delete -e "ssh -i $KEY" \
  prisma/ "$SERVER:$REMOTE_DIR/prisma/"

echo "==> 确保服务器 generated 目录存在..."
ssh -i "$KEY" "$SERVER" "mkdir -p $REMOTE_DIR/generated"

echo "==> 同步 generated/prisma 到服务器..."
rsync -avz --delete -e "ssh -i $KEY" \
  generated/prisma/ "$SERVER:$REMOTE_DIR/generated/prisma/"

echo "==> 同步 package.json 到服务器..."
rsync -avz -e "ssh -i $KEY" \
  package.json "$SERVER:$REMOTE_DIR/package.json"

echo "==> 服务器端安装 prisma CLI..."
ssh -i "$KEY" "$SERVER" "cd $REMOTE_DIR && npm install prisma@^7.8.0 --save-dev"

echo "==> 服务器端重新生成 Prisma Client..."
ssh -i "$KEY" "$SERVER" "cd $REMOTE_DIR && npx prisma generate"

echo "==> 修复服务器 .env 数据库路径..."
ssh -i "$KEY" "$SERVER" "sed -i 's|file:/Users/koito/Desktop/Project/[^/]*/prisma/dev.db|file:/home/ubuntu/weekly/prisma/dev.db|' $REMOTE_DIR/.next/standalone/.env 2>/dev/null || true"

echo "==> 重启服务..."
ssh -i "$KEY" "$SERVER" "cd $REMOTE_DIR/.next/standalone && export DATABASE_URL='file:/home/ubuntu/weekly/prisma/dev.db' && (pm2 restart $PM2_NAME --update-env 2>/dev/null || pm2 start server.js --name $PM2_NAME --cwd $REMOTE_DIR/.next/standalone --env production)"

echo "==> 完成"
