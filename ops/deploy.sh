#!/bin/bash
set -e

# 确保在项目根目录执行
cd "$(dirname "$0")/.."

source ops/server.env.sh

LOCKFILE=".deploying"

# 锁文件：防止多 Agent 同时部署
if [ -f "$LOCKFILE" ]; then
  echo "[错误] 检测到 $LOCKFILE，可能另一个部署正在进行。"
  echo "如果确认没有正在进行的部署，可以手动删除：rm $LOCKFILE"
  exit 1
fi

touch "$LOCKFILE"
trap 'rm -f "$LOCKFILE"' EXIT

# 分支检查：必须在 main 分支部署
if [ "$(git branch --show-current)" != "main" ]; then
  echo "[错误] 必须在 main 分支部署，当前分支：$(git branch --show-current)"
  exit 1
fi

# 未提交修改检查
if [ -n "$(git status --porcelain)" ]; then
  echo "[错误] 存在未提交的修改，请先 commit"
  git status --short
  exit 1
fi

echo "==> 运行 lint (max-warnings=0)..."
npm run lint -- --max-warnings=0

echo "==> 运行类型检查..."
npx tsc --noEmit

echo "==> 推送到 GitHub..."
git push origin main

echo "==> 服务器端部署..."

# 组装服务器端部署命令
REMOTE_CMD="cd $REMOTE_DIR"

# 数据库路径迁移：如果旧路径有数据但新路径没有，自动移动
REMOTE_CMD="$REMOTE_CMD && if [ -f prisma/dev.db ] && [ ! -f data/dev.db ]; then mkdir -p data && mv prisma/dev.db data/dev.db; fi"

REMOTE_CMD="$REMOTE_CMD && echo '==> 拉取最新代码...' && git fetch origin main && git reset --hard origin/main"
REMOTE_CMD="$REMOTE_CMD && echo '==> 修正 .env 数据库路径...' && sed -i \"s|file:.*/prisma/dev.db|file:$REMOTE_DIR/prisma/dev.db|\" .env"
REMOTE_CMD="$REMOTE_CMD && echo '==> 同步数据库 schema...' && npx prisma db push --accept-data-loss"
REMOTE_CMD="$REMOTE_CMD && echo '==> 安装依赖...' && npm install"
REMOTE_CMD="$REMOTE_CMD && echo '==> 构建...' && DATABASE_URL=file:$REMOTE_DIR/data/dev.db npm run build"
REMOTE_CMD="$REMOTE_CMD && echo '==> 复制静态资源到 standalone...' && cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/"
REMOTE_CMD="$REMOTE_CMD && echo '==> 重启服务...' && pm2 restart $PM2_NAME --update-env 2>/dev/null || pm2 start .next/standalone/server.js --name $PM2_NAME --cwd $REMOTE_DIR/.next/standalone --env production"
REMOTE_CMD="$REMOTE_CMD && echo '==> 保存 PM2 配置...' && pm2 save"

# 支持密钥内容直接写入 env，或密钥文件路径
if [ -n "$KEY_CONTENT" ]; then
  TMP_KEY=$(mktemp)
  printf '%s\n' "$KEY_CONTENT" > "$TMP_KEY"
  chmod 600 "$TMP_KEY"
  trap 'rm -f "$LOCKFILE" "$TMP_KEY"' EXIT
  ssh -i "$TMP_KEY" "$SERVER" "$REMOTE_CMD"
else
  ssh -i "$KEY" "$SERVER" "$REMOTE_CMD"
fi

echo "==> 完成"
