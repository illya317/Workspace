#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

SERVER="${SERVER:-}"
REMOTE_DIR="${REMOTE_DIR:-}"
PM2_NAME="${PM2_NAME:-workspace}"
REMOTE_WORKSPACE_CONFIG_DIR="${REMOTE_WORKSPACE_CONFIG_DIR:-}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-}"
RUN_LOCAL_CHECKS="${RUN_LOCAL_CHECKS:-1}"
ENV_CONTENT="${ENV_CONTENT:-}"
if [ -n "$ENV_CONTENT" ]; then
  ENV_CONTENT_B64="$(printf '%s' "$ENV_CONTENT" | base64 | tr -d '\n')"
else
  ENV_CONTENT_B64=""
fi

if [ -z "$SERVER" ]; then
  echo "[错误] 缺少 SERVER 环境变量，例如 ubuntu@1.2.3.4"
  exit 1
fi

if [ -z "$REMOTE_DIR" ]; then
  echo "[错误] 缺少 REMOTE_DIR 环境变量，例如 /home/ubuntu/workspace"
  exit 1
fi

if [ -z "$REMOTE_WORKSPACE_CONFIG_DIR" ]; then
  REMOTE_WORKSPACE_CONFIG_DIR="$(dirname "$REMOTE_DIR")/.workspace"
fi

TMPKEY=""
if [ -n "${KEY:-}" ]; then
  SSH_KEY="$KEY"
elif [ -n "${KEY_CONTENT:-}" ]; then
  TMPKEY=$(mktemp)
  printf '%s\n' "$KEY_CONTENT" > "$TMPKEY"
  chmod 600 "$TMPKEY"
  SSH_KEY="$TMPKEY"
else
  echo "[错误] 需要 KEY 或 KEY_CONTENT 环境变量"
  exit 1
fi
trap 'rm -f "${TMPKEY:-}"' EXIT

ssh_cmd() {
  ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$SERVER" "$@"
}

require_local_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[错误] 当前 CI 容器缺少命令: $cmd"
    exit 1
  fi
}

hash_cmd() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256
  else
    sha256sum
  fi
}

local_pkg_hash() {
  cat package.json package-lock.json | hash_cmd | awk '{print $1}'
}

remote_pkg_hash() {
  ssh_cmd "
    cd '$REMOTE_DIR' 2>/dev/null || exit 0
    [ -f package.json ] && [ -f package-lock.json ] || exit 0
    cat package.json package-lock.json | sha256sum | awk '{print \$1}'
  " 2>/dev/null || true
}

run_local_checks() {
  echo "==> 安装 CI 依赖..."
  npm ci --no-audit --fund=false --loglevel=error

  echo "==> 运行静态检查..."
  npm run arch:check
  npm run api:check
  npm run docs:check
  npm run db:validate
  npm run schema:check
  npm run company:check
  npm run size:check
  npm run lint -- --max-warnings=0
  npx tsc --noEmit
}

prepare_remote_runtime() {
  echo "==> 准备服务器运行态配置..."
  ssh_cmd "
    set -e
    mkdir -p '$REMOTE_DIR'
    mkdir -p '$REMOTE_WORKSPACE_CONFIG_DIR'
    if [ ! -f '$REMOTE_WORKSPACE_CONFIG_DIR/.env' ]; then
      if [ -f '$REMOTE_DIR/.env' ]; then
        cp '$REMOTE_DIR/.env' '$REMOTE_WORKSPACE_CONFIG_DIR/.env'
      elif [ -n '$ENV_CONTENT_B64' ]; then
        printf '%s' '$ENV_CONTENT_B64' | base64 -d > '$REMOTE_WORKSPACE_CONFIG_DIR/.env'
      else
        echo '[错误] 服务器缺少运行态 .env，且未提供 ENV_CONTENT'
        exit 1
      fi
    fi
    mkdir -p '$REMOTE_WORKSPACE_CONFIG_DIR/data'
    if [ ! -f '$REMOTE_WORKSPACE_CONFIG_DIR/data/dev.db' ] && [ -d '$REMOTE_DIR/data' ]; then
      rsync -a '$REMOTE_DIR/data/' '$REMOTE_WORKSPACE_CONFIG_DIR/data/'
    fi

    cd '$REMOTE_DIR'
    ln -sfn '$REMOTE_WORKSPACE_CONFIG_DIR/.env' .env
    mkdir -p public

    if [ -d '$REMOTE_WORKSPACE_CONFIG_DIR/assets/brand/company' ]; then
      rm -rf public/company
      ln -sfn '$REMOTE_WORKSPACE_CONFIG_DIR/assets/brand/company' public/company
    fi

    if [ -d '$REMOTE_WORKSPACE_CONFIG_DIR/assets/agent/avatar' ]; then
      mkdir -p public/assets/agent
      rm -rf public/assets/agent/avatar
      ln -sfn '$REMOTE_WORKSPACE_CONFIG_DIR/assets/agent/avatar' public/assets/agent/avatar
    fi

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
  "
}

validate_remote_runtime() {
  echo "==> 校验服务器运行态配置..."
  ssh_cmd "
    set -e
    cd '$REMOTE_DIR'
    test -f .env
    grep -q '^WORKSPACE_CONFIG_DIR=' .env
    grep -q '^DATABASE_URL=' .env
    python3 - <<'PY'
from pathlib import Path
import os
import sys

env = {}
for line in Path('.env').read_text().splitlines():
    if not line or line.lstrip().startswith('#') or '=' not in line:
        continue
    key, value = line.split('=', 1)
    env[key] = value.strip().strip('\"').strip(\"'\")

workspace = env.get('WORKSPACE_CONFIG_DIR', '')
database = env.get('DATABASE_URL', '')
if not workspace:
    sys.exit('WORKSPACE_CONFIG_DIR missing from remote .env')
if not os.path.isabs(workspace):
    sys.exit(f'WORKSPACE_CONFIG_DIR must be absolute: {workspace}')
if not database.startswith('file:'):
    sys.exit('DATABASE_URL must use file: for production SQLite')
db_path = database[5:].strip('\"').strip(\"'\")
if not os.path.isabs(db_path):
    sys.exit(f'DATABASE_URL must be absolute: {db_path}')
expected_prefix = os.path.join(workspace, 'data') + os.sep
if not db_path.startswith(expected_prefix):
    sys.exit(f'DATABASE_URL must live under WORKSPACE_CONFIG_DIR/data: {db_path}')
print('Remote runtime env check passed.')
PY
  "
}

deploy_remote_app() {
  echo "==> 服务器构建并重启服务..."
  ssh_cmd "
    set -e
    cd '$REMOTE_DIR'
    while pgrep -af '/node_modules/.bin/next build|next build' >/dev/null 2>&1; do
      echo '==> 检测到已有 next build 在运行，等待其结束...'
      sleep 5
    done
    if [ -f .next/lock ]; then
      echo '==> 清理遗留的 .next/lock'
      rm -f .next/lock
    fi
    if [ '$NEED_NPM_CI' = '1' ] || [ ! -d node_modules ]; then
      echo '==> 安装依赖...'
      npm ci --no-audit --fund=false --loglevel=error
    else
      echo '==> 跳过 npm ci，复用服务器 node_modules'
    fi

    npm run build

    rm -rf .next/standalone/.next/static
    cp -r .next/static .next/standalone/.next/static
    rm -rf .next/standalone/public
    cp -rL public .next/standalone/public
    cp .env .next/standalone/.env
    rm -rf .next/standalone/data
    grep -q '^WORKSPACE_CONFIG_DIR=' .next/standalone/.env
    grep -q '^DATABASE_URL=' .next/standalone/.env

    pm2 delete '$PM2_NAME' 2>/dev/null || true
    cd .next/standalone
    pm2 start server.js --name '$PM2_NAME' --cwd '$REMOTE_DIR/.next/standalone'
    pm2 save
    pm2 status
  "
}

run_healthcheck() {
  if [ -z "$HEALTHCHECK_URL" ]; then
    return
  fi

  echo "==> 健康检查..."
  ssh_cmd "curl -fsS '$HEALTHCHECK_URL' >/dev/null"
}

if [ "$RUN_LOCAL_CHECKS" = "1" ] && ! command -v npm >/dev/null 2>&1; then
  echo "==> 当前 CI 容器未提供 npm，自动跳过本地静态检查"
  RUN_LOCAL_CHECKS=0
fi

echo "==> 校验 CI 基础命令..."
require_local_cmd ssh
require_local_cmd rsync
echo "==> ssh: $(command -v ssh)"
echo "==> rsync: $(command -v rsync)"

if [ "$RUN_LOCAL_CHECKS" = "1" ]; then
  run_local_checks
else
  echo "==> 跳过本地静态检查（RUN_LOCAL_CHECKS=$RUN_LOCAL_CHECKS）"
fi

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
echo "==> 验证服务器连接..."
ssh_cmd "echo CONNECTED && whoami && mkdir -p '$REMOTE_DIR'"
echo "==> 开始 rsync..."
rsync -avz --delete -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=accept-new" \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='.next/' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='data/' \
  --exclude='public/assets/agent/avatar/' \
  --exclude='public/company' \
  --exclude='public/company/' \
  --exclude='.DS_Store' \
  ./ "$SERVER:$REMOTE_DIR/"

prepare_remote_runtime
validate_remote_runtime
deploy_remote_app
run_healthcheck

echo ""
echo "==> CI 部署完成"
