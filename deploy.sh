#!/bin/bash
set -e

SERVER="ubuntu@49.235.213.225"
REMOTE_DIR="/home/ubuntu/weekly-new"
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

echo "==> 运行 lint (max-warnings=0)..."
npm run lint -- --max-warnings=0

echo "==> 运行类型检查..."
npx tsc --noEmit

echo "==> 推送到 GitHub..."
git push origin main

echo "==> 服务器端部署..."

# 组装服务器端部署命令
REMOTE_CMD="cd $REMOTE_DIR"

if [ "$PUSH_DB" = true ]; then
  REMOTE_CMD="$REMOTE_CMD && echo '==> 同步数据库 schema...' && DATABASE_URL=file:$REMOTE_DIR/prisma/dev.db npx prisma db push --accept-data-loss"
fi

REMOTE_CMD="$REMOTE_CMD && echo '==> 拉取最新代码...' && git fetch origin main && git reset --hard origin/main"
REMOTE_CMD="$REMOTE_CMD && echo '==> 安装依赖...' && npm install"
REMOTE_CMD="$REMOTE_CMD && echo '==> 构建...' && DATABASE_URL=file:$REMOTE_DIR/prisma/dev.db npm run build"
REMOTE_CMD="$REMOTE_CMD && echo '==> 复制静态资源到 standalone...' && cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/"
REMOTE_CMD="$REMOTE_CMD && echo '==> 重启服务...' && pm2 restart $PM2_NAME --update-env 2>/dev/null || pm2 start .next/standalone/server.js --name $PM2_NAME --cwd $REMOTE_DIR/.next/standalone --env production"
REMOTE_CMD="$REMOTE_CMD && echo '==> 保存 PM2 配置...' && pm2 save"

ssh -i "$KEY" "$SERVER" "$REMOTE_CMD"

echo "==> 完成"
