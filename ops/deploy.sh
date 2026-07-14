#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

SERVER="${SERVER:-}"
REMOTE_DIR="${REMOTE_DIR:-}"
PM2_NAME="${PM2_NAME:-workspace}"
PM2_WECOM_BOT_NAME="${PM2_WECOM_BOT_NAME:-${PM2_NAME}-wecom-agent}"
REMOTE_WORKSPACE_CONFIG_DIR="${REMOTE_WORKSPACE_CONFIG_DIR:-}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-}"
RUN_LOCAL_CHECKS="${RUN_LOCAL_CHECKS:-1}"
ALLOW_NON_LINUX_BUILD="${ALLOW_NON_LINUX_BUILD:-0}"
ENV_CONTENT="${ENV_CONTENT:-}"
REMOTE_BACKUP_DIR="${REMOTE_BACKUP_DIR:-}"
REMOTE_WORKSPACE_BACKUP_DIR="${REMOTE_WORKSPACE_BACKUP_DIR:-}"
REMOTE_AGENT_SOURCE_ROOT="${REMOTE_AGENT_SOURCE_ROOT:-$REMOTE_DIR/source}"
REMOTE_AGENT_SOURCE_DIR="${REMOTE_AGENT_SOURCE_DIR:-$REMOTE_AGENT_SOURCE_ROOT/Workspace}"
REMOTE_AGENT_SOURCE_REPO_URL="${REMOTE_AGENT_SOURCE_REPO_URL:-${AGENT_SOURCE_REPO_URL:-https://cnb.cool/illya317/Workspace.git}}"
REMOTE_AGENT_SOURCE_BRANCH="${REMOTE_AGENT_SOURCE_BRANCH:-${AGENT_SOURCE_BRANCH:-main}}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
BACKUP_RETENTION_COUNT="${BACKUP_RETENTION_COUNT:-5}"
LIBRARY_SYNC_SOURCE="${LIBRARY_SYNC_SOURCE:-}"
INSTALL_LIBRARY_RUNTIME_DEPS="${INSTALL_LIBRARY_RUNTIME_DEPS:-1}"
INSTALL_KIMI_AGENT_RUNTIME_DEPS="${INSTALL_KIMI_AGENT_RUNTIME_DEPS:-1}"
REMOTE_AGENT_SOURCE_ROOT_NAME="$(basename "$REMOTE_AGENT_SOURCE_ROOT")"
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
  echo "[错误] 缺少 REMOTE_DIR 环境变量，例如 /home/<user>/workspace"
  exit 1
fi

if [ -z "$HEALTHCHECK_URL" ]; then
  echo "[错误] 缺少 HEALTHCHECK_URL；部署必须配置服务器本机可访问的强制健康检查地址"
  exit 1
fi
case "$HEALTHCHECK_URL" in
  http://*|https://*) ;;
  *) echo "[错误] HEALTHCHECK_URL 必须使用 http:// 或 https://"; exit 1 ;;
esac
case "$HEALTHCHECK_URL" in
  *"'"*) echo "[错误] HEALTHCHECK_URL 不能包含单引号"; exit 1 ;;
esac

if [ -z "$REMOTE_WORKSPACE_CONFIG_DIR" ]; then
  REMOTE_WORKSPACE_CONFIG_DIR="$REMOTE_DIR/.workspace"
elif [ "$REMOTE_WORKSPACE_CONFIG_DIR" != "$REMOTE_DIR/.workspace" ]; then
  echo "[警告] REMOTE_WORKSPACE_CONFIG_DIR 已统一为 $REMOTE_DIR/.workspace，忽略旧值: $REMOTE_WORKSPACE_CONFIG_DIR"
  REMOTE_WORKSPACE_CONFIG_DIR="$REMOTE_DIR/.workspace"
fi

if [ -z "$REMOTE_BACKUP_DIR" ] && [ -n "$REMOTE_WORKSPACE_BACKUP_DIR" ]; then
  REMOTE_BACKUP_DIR="$REMOTE_WORKSPACE_BACKUP_DIR"
fi

if [ -z "$REMOTE_BACKUP_DIR" ]; then
  REMOTE_BACKUP_DIR="$REMOTE_DIR/.workspace.backups"
elif [ "$REMOTE_BACKUP_DIR" != "$REMOTE_DIR/.workspace.backups" ]; then
  echo "[警告] REMOTE_BACKUP_DIR 已统一为 $REMOTE_DIR/.workspace.backups，忽略旧值: $REMOTE_BACKUP_DIR"
  REMOTE_BACKUP_DIR="$REMOTE_DIR/.workspace.backups"
fi
REMOTE_RUNTIME_SNAPSHOT_DIR="$REMOTE_BACKUP_DIR/workspace-runtime-snapshots"

case "$BACKUP_RETENTION_DAYS" in
  ''|*[!0-9]*) echo "[错误] BACKUP_RETENTION_DAYS 必须是非负整数"; exit 1 ;;
esac
case "$BACKUP_RETENTION_COUNT" in
  ''|*[!0-9]*) echo "[错误] BACKUP_RETENTION_COUNT 必须是非负整数"; exit 1 ;;
esac
if [ "$BACKUP_RETENTION_COUNT" -lt 1 ]; then
  echo "[错误] BACKUP_RETENTION_COUNT 必须至少为 1，避免删除本次部署备份"
  exit 1
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

# Reuse one authenticated transport so public pre-auth traffic cannot make the
# many deployment ssh/rsync steps repeatedly compete with sshd MaxStartups.
SSH_CONTROL_DIR="$(mktemp -d)"
SSH_CONTROL_PATH="$SSH_CONTROL_DIR/master"
SSH_CONTROL_PERSIST_SECONDS="${SSH_CONTROL_PERSIST_SECONDS:-900}"
SSH_OPTIONS=(
  -i "$SSH_KEY"
  -o BatchMode=yes
  -o ConnectTimeout=15
  -o ConnectionAttempts=1
  -o StrictHostKeyChecking=accept-new
  -o ControlMaster=auto
  -o "ControlPersist=${SSH_CONTROL_PERSIST_SECONDS}"
  -o "ControlPath=$SSH_CONTROL_PATH"
  -o ServerAliveInterval=30
  -o ServerAliveCountMax=3
)
RSYNC_SSH_COMMAND="ssh -i $SSH_KEY -o BatchMode=yes -o ConnectTimeout=15 -o ConnectionAttempts=1 -o StrictHostKeyChecking=accept-new -o ControlMaster=auto -o ControlPersist=$SSH_CONTROL_PERSIST_SECONDS -o ControlPath=$SSH_CONTROL_PATH -o ServerAliveInterval=30 -o ServerAliveCountMax=3"

cleanup_deploy() {
  ssh "${SSH_OPTIONS[@]}" -O exit "$SERVER" >/dev/null 2>&1 || true
  rm -rf "$SSH_CONTROL_DIR"
  rm -f "${TMPKEY:-}"
}
trap cleanup_deploy EXIT

ssh_cmd() {
  ssh "${SSH_OPTIONS[@]}" "$SERVER" "$@"
}

start_ssh_master() {
  local attempt
  for attempt in 1 2 3 4 5; do
    if ssh "${SSH_OPTIONS[@]}" -fN "$SERVER"; then
      return
    fi
    if [ "$attempt" -lt 5 ]; then
      echo "[警告] SSH 控制连接建立失败（第 $attempt/5 次），5 秒后重试..."
      sleep 5
    fi
  done
  echo "[错误] SSH 控制连接连续 5 次建立失败"
  exit 1
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

copy_runtime_package() {
  local pkg="$1"
  if [ ! -e "node_modules/$pkg" ]; then
    echo "[错误] 构建产物缺少运行时依赖: node_modules/$pkg"
    exit 1
  fi
  rm -rf ".next/standalone/node_modules/$pkg"
  mkdir -p ".next/standalone/node_modules/$(dirname "$pkg")"
  cp -R "node_modules/$pkg" ".next/standalone/node_modules/$pkg"
}

copy_runtime_package_tree() {
  node - "$@" <<'NODE' | while IFS= read -r pkg; do
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const roots = process.argv.slice(2);
const seen = new Set();

function packageDir(name) {
  if (name.startsWith("@")) {
    return path.join(root, "node_modules", ...name.split("/"));
  }
  return path.join(root, "node_modules", name);
}

function walk(name, optional = false) {
  if (seen.has(name)) return;
  const packageJson = path.join(packageDir(name), "package.json");
  if (!fs.existsSync(packageJson)) {
    if (optional) return;
    throw new Error(`Missing runtime dependency: ${name}`);
  }
  seen.add(name);
  const pkg = JSON.parse(fs.readFileSync(packageJson, "utf8"));
  for (const dependency of Object.keys(pkg.dependencies || {})) {
    walk(dependency);
  }
  for (const dependency of Object.keys(pkg.optionalDependencies || {})) {
    walk(dependency, true);
  }
}

for (const name of roots) {
  walk(name);
}
for (const name of [...seen].sort()) {
  console.log(name);
}
NODE
    copy_runtime_package "$pkg"
  done
}

copy_prisma_deploy_files() {
  echo "==> 打包 Prisma schema、migrations 和 CLI..."
  test -f prisma.config.ts
  test -f prisma/schema.prisma
  test -f prisma/migrations/migration_lock.toml
  test -f scripts/check/check-prisma-deploy-status.js

  rm -rf .next/standalone/prisma .next/standalone/prisma.config.ts
  mkdir -p .next/standalone/prisma
  cp prisma/schema.prisma .next/standalone/prisma/schema.prisma
  cp -R prisma/models .next/standalone/prisma/models
  cp -R prisma/migrations .next/standalone/prisma/migrations
  cp -R prisma/migrations-sqlite-legacy .next/standalone/prisma/migrations-sqlite-legacy
  cp prisma.config.ts .next/standalone/prisma.config.ts
  mkdir -p .next/standalone/scripts/check
  cp scripts/check/check-prisma-deploy-status.js .next/standalone/scripts/check/check-prisma-deploy-status.js
  mkdir -p .next/standalone/scripts/migrate
  cp scripts/migrate/sqlite-to-postgresql.mjs .next/standalone/scripts/migrate/sqlite-to-postgresql.mjs

  rm -rf .next/standalone/node_modules/prisma .next/standalone/node_modules/@prisma
  mkdir -p .next/standalone/node_modules
  cp -R node_modules/prisma .next/standalone/node_modules/prisma
  cp -R node_modules/@prisma .next/standalone/node_modules/@prisma
  node - <<'NODE' | while IFS= read -r pkg; do
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const seen = new Set();

function packageDir(name) {
  if (name.startsWith("@")) {
    return path.join(root, "node_modules", ...name.split("/"));
  }
  return path.join(root, "node_modules", name);
}

function walk(name) {
  if (seen.has(name)) return;
  seen.add(name);
  const packageJson = path.join(packageDir(name), "package.json");
  if (!fs.existsSync(packageJson)) {
    throw new Error(`Missing Prisma CLI dependency: ${name}`);
  }
  const pkg = JSON.parse(fs.readFileSync(packageJson, "utf8"));
  for (const dependency of Object.keys(pkg.dependencies || {})) {
    walk(dependency);
  }
}

walk("prisma");
for (const name of [...seen].filter((value) => value !== "prisma" && !value.startsWith("@prisma/")).sort()) {
  console.log(name);
}
NODE
    copy_runtime_package "$pkg"
  done

  test -f .next/standalone/prisma/schema.prisma
  test -f .next/standalone/prisma/migrations/migration_lock.toml
  test -f .next/standalone/prisma/migrations-sqlite-legacy/migration_lock.toml
  test -f .next/standalone/prisma.config.ts
  test -f .next/standalone/scripts/check/check-prisma-deploy-status.js
  test -f .next/standalone/scripts/migrate/sqlite-to-postgresql.mjs
  test -f .next/standalone/node_modules/prisma/build/index.js
  test -f .next/standalone/node_modules/effect/package.json
}

copy_resource_seed_files() {
  echo "==> 打包 RBAC resource manifest..."
  npx tsx scripts/write-resource-manifest.ts .next/standalone/resource-defs.json
  cp scripts/seed-resources-runtime.mjs .next/standalone/seed-resources-runtime.mjs
  mkdir -p .next/standalone/scripts/check
  cp scripts/check/check-permission-action-grants.mjs .next/standalone/scripts/check/check-permission-action-grants.mjs
  test -f .next/standalone/resource-defs.json
  test -f .next/standalone/seed-resources-runtime.mjs
  test -f .next/standalone/scripts/check/check-permission-action-grants.mjs
}

run_local_checks() {
  echo "==> 安装 CI 依赖..."
  npm ci --no-audit --fund=false --loglevel=error

  echo "==> 运行静态检查..."
  npm run deploy:preflight:ci
  npm run docs:check
}

ensure_build_deps() {
  if [ ! -d node_modules ]; then
    echo "==> 当前构建环境缺少 node_modules，安装依赖..."
    npm ci --no-audit --fund=false --loglevel=error
  fi
}

build_artifact() {
  if [ "$(uname -s)" != "Linux" ] && [ "$ALLOW_NON_LINUX_BUILD" != "1" ]; then
    echo "[错误] 当前部署脚本会上传本机 standalone 产物。请在 CNB/Linux CI 中运行；如确认要从当前机器构建，设置 ALLOW_NON_LINUX_BUILD=1。"
    exit 1
  fi

  ensure_build_deps

  echo "==> 在当前 CI/CNB 环境构建 Next standalone 产物..."
  npm run build

  local standalone_server
  local standalone_app_dir
  standalone_server="$(find .next/standalone -path '*/node_modules/*' -prune -o -type f -name server.js -print | head -n 1)"
  if [ -z "$standalone_server" ]; then
    echo "[错误] Next standalone 产物缺少 server.js"
    find .next/standalone -maxdepth 4 -type f | sort | head -80 || true
    exit 1
  fi
  standalone_app_dir="$(dirname "$standalone_server")"
  printf '%s\n' "${standalone_server#.next/standalone/}" > .next/standalone/.server-entry

  rm -rf "$standalone_app_dir/.next/static"
  mkdir -p "$standalone_app_dir/.next"
  cp -r .next/static "$standalone_app_dir/.next/static"
  rm -rf "$standalone_app_dir/public"
  # Keep runtime asset symlinks as symlinks in CI. The server-side deploy step
  # below relinks them to REMOTE_WORKSPACE_CONFIG_DIR after extraction.
  cp -R public "$standalone_app_dir/public"
  rm -rf "$standalone_app_dir/data"
  rm -f "$standalone_app_dir/.env"

  # Next standalone tracing can leave database/runtime packages as partial shells.
  # Keep the PostgreSQL adapter stack complete so production does not depend on
  # bundler internals for database access.
  copy_runtime_package_tree pg @prisma/adapter-pg @prisma/client dotenv @wecom/aibot-node-sdk @moonshot-ai/kimi-agent-sdk
  copy_prisma_deploy_files
  copy_resource_seed_files

  mkdir -p .next/standalone/scripts/runtime
  cp scripts/runtime/wecom-agent-bot.mjs .next/standalone/scripts/runtime/wecom-agent-bot.mjs
  cp scripts/runtime/wecom-agent-delivery.mjs .next/standalone/scripts/runtime/wecom-agent-delivery.mjs
  cp scripts/runtime/wecom-agent-input.mjs .next/standalone/scripts/runtime/wecom-agent-input.mjs
  cp scripts/runtime/wecom-agent-stream.mjs .next/standalone/scripts/runtime/wecom-agent-stream.mjs

  rm -rf .next/standalone/generated/prisma
  mkdir -p .next/standalone/generated
  cp -R generated/prisma .next/standalone/generated/prisma
  rm -rf .next/standalone/generated/production/qc/template-snapshots
  mkdir -p .next/standalone/generated/production/qc
  cp -R generated/production/qc/template-snapshots .next/standalone/generated/production/qc/template-snapshots
  find .next/standalone \( -name '.DS_Store' -o -name '._*' \) -delete

  test -f .next/standalone/node_modules/pg/lib/index.js
  test -f .next/standalone/node_modules/@prisma/adapter-pg/dist/index.js
  test -f .next/standalone/node_modules/@prisma/client/default.js
  test -f .next/standalone/node_modules/@wecom/aibot-node-sdk/dist/index.cjs.js
  test -f .next/standalone/node_modules/@moonshot-ai/kimi-agent-sdk/dist/index.cjs
  test -f .next/standalone/scripts/runtime/wecom-agent-bot.mjs
  test -f .next/standalone/scripts/runtime/wecom-agent-delivery.mjs
  test -f .next/standalone/scripts/runtime/wecom-agent-input.mjs
  test -f .next/standalone/scripts/runtime/wecom-agent-stream.mjs
  test -f .next/standalone/generated/prisma/client.ts
  test -f .next/standalone/generated/production/qc/template-snapshots/products/allopurinol.json

  ARTIFACT_PATH=".next/workspace-standalone.tgz"
  rm -f "$ARTIFACT_PATH"
  COPYFILE_DISABLE=1 tar -C .next/standalone -czf "$ARTIFACT_PATH" .
  ARTIFACT_SHA="$(hash_cmd < "$ARTIFACT_PATH" | awk '{print $1}')"
  echo "==> 产物: $ARTIFACT_PATH ($ARTIFACT_SHA)"
}

prepare_remote_runtime() {
  echo "==> 准备服务器运行态配置..."
  ssh_cmd "
    set -e
    mkdir -p '$REMOTE_DIR'
    mkdir -p '$REMOTE_DIR/releases'
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
    mkdir -p '$REMOTE_WORKSPACE_CONFIG_DIR/library'
    if [ ! -f '$REMOTE_WORKSPACE_CONFIG_DIR/data/dev.db' ] && [ -d '$REMOTE_DIR/data' ]; then
      rsync -a '$REMOTE_DIR/data/' '$REMOTE_WORKSPACE_CONFIG_DIR/data/'
    fi

    python3 - <<'PY'
from pathlib import Path
import re

env_path = Path('$REMOTE_WORKSPACE_CONFIG_DIR/.env')
text = env_path.read_text()
replacements = {
    'WORKSPACE_CONFIG_DIR': '$REMOTE_WORKSPACE_CONFIG_DIR',
    'AGENT_SOURCE_WORKTREE': '$REMOTE_AGENT_SOURCE_DIR',
    'LIBRARY_SOURCE_ROOT': '$REMOTE_WORKSPACE_CONFIG_DIR/library/originals',
    'LIBRARY_ROOT': '$REMOTE_WORKSPACE_CONFIG_DIR/library',
}
obsolete_agent_keys = {
    'AGENT_MODEL_PROVIDER',
    'KIMI_API_KEY',
    'KIMI_BASE_URL',
    'KIMI_MODEL',
    'KIMI_MAX_TOKENS',
    'DEEPSEEK_API_KEY',
    'DEEPSEEK_BASE_URL',
    'DEEPSEEK_MODEL',
}
retired_agent_lines = [
    line for line in text.splitlines()
    if any(re.match(rf'^\s*{re.escape(key)}\s*=', line) for key in obsolete_agent_keys)
]
if retired_agent_lines:
    retired_dir = env_path.parent / 'retired'
    retired_dir.mkdir(mode=0o700, exist_ok=True)
    retired_path = retired_dir / 'agent-provider.env'
    if not retired_path.exists():
        retired_path.write_text('\n'.join(retired_agent_lines) + '\n')
        retired_path.chmod(0o600)
text = '\n'.join(
    line for line in text.splitlines()
    if not any(re.match(rf'^\s*{re.escape(key)}\s*=', line) for key in obsolete_agent_keys)
) + '\n'
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

sync_remote_library_source() {
  if [ -z "$LIBRARY_SYNC_SOURCE" ]; then
    echo "==> 未配置 LIBRARY_SYNC_SOURCE；沿用服务器持久化资料库"
    return
  fi
  if [ ! -d "$LIBRARY_SYNC_SOURCE" ]; then
    echo "[错误] LIBRARY_SYNC_SOURCE 不是可读目录: $LIBRARY_SYNC_SOURCE"
    exit 1
  fi
  echo "==> 同步资料库源文件到服务器只读导入目录..."
  ssh_cmd "mkdir -p '$REMOTE_WORKSPACE_CONFIG_DIR/library/originals'"
  rsync -az --checksum --exclude='.versions/' \
    -e "$RSYNC_SSH_COMMAND" \
    "$LIBRARY_SYNC_SOURCE/" "$SERVER:$REMOTE_WORKSPACE_CONFIG_DIR/library/originals/"
}

ensure_remote_library_runtime_deps() {
  if [ "$INSTALL_LIBRARY_RUNTIME_DEPS" != "1" ]; then
    echo "==> 跳过服务器 OCR/PDF 依赖安装（INSTALL_LIBRARY_RUNTIME_DEPS=$INSTALL_LIBRARY_RUNTIME_DEPS）"
    return
  fi

  local remote_tool_dir="$REMOTE_WORKSPACE_CONFIG_DIR/runtime/library-worker"
  echo "==> 同步并安装服务器 OCR/PDF 依赖..."
  ssh_cmd "mkdir -p '$remote_tool_dir'"
  rsync -az -e "$RSYNC_SSH_COMMAND" \
    ops/install-library-runtime-deps.sh \
    ops/install-library-embedding-model.sh \
    ops/library-worker-requirements.txt \
    ops/library-runtime-smoke.py \
    "$SERVER:$remote_tool_dir/"
  ssh_cmd "chmod +x '$remote_tool_dir/install-library-runtime-deps.sh' '$remote_tool_dir/install-library-embedding-model.sh' '$remote_tool_dir/library-runtime-smoke.py' && '$remote_tool_dir/install-library-runtime-deps.sh' --server && '$remote_tool_dir/install-library-embedding-model.sh'"
}

ensure_remote_kimi_agent_runtime() {
  if [ "$INSTALL_KIMI_AGENT_RUNTIME_DEPS" != "1" ]; then
    echo "==> 跳过 Kimi Agent SDK 运行时安装（INSTALL_KIMI_AGENT_RUNTIME_DEPS=$INSTALL_KIMI_AGENT_RUNTIME_DEPS）"
    return
  fi

  local remote_tool_dir="$REMOTE_WORKSPACE_CONFIG_DIR/runtime/kimi-agent-bootstrap"
  echo "==> 同步并安装 Kimi Agent SDK 隔离运行时..."
  ssh_cmd "mkdir -p '$remote_tool_dir'"
  rsync -az -e "$RSYNC_SSH_COMMAND" \
    ops/install-kimi-agent-runtime.sh \
    ops/kimi-agent-sandbox-runner.sh \
    "$SERVER:$remote_tool_dir/"
  ssh_cmd "chmod +x '$remote_tool_dir/install-kimi-agent-runtime.sh' '$remote_tool_dir/kimi-agent-sandbox-runner.sh' && WORKSPACE_CONFIG_DIR='$REMOTE_WORKSPACE_CONFIG_DIR' '$remote_tool_dir/install-kimi-agent-runtime.sh'"
}

sync_remote_agent_source() {
  echo "==> 同步服务器页面助手源码: $REMOTE_AGENT_SOURCE_BRANCH -> $REMOTE_AGENT_SOURCE_DIR"
  ssh_cmd "
    set -e
    if ! command -v git >/dev/null 2>&1; then
      echo '[错误] 服务器缺少 git，无法同步页面助手源码'
      exit 1
    fi
    mkdir -p \"\$(dirname '$REMOTE_AGENT_SOURCE_DIR')\"
    if [ -d '$REMOTE_AGENT_SOURCE_DIR/.git' ]; then
      git -C '$REMOTE_AGENT_SOURCE_DIR' remote set-url origin '$REMOTE_AGENT_SOURCE_REPO_URL'
      git -C '$REMOTE_AGENT_SOURCE_DIR' fetch --depth=1 origin '$REMOTE_AGENT_SOURCE_BRANCH'
      git -C '$REMOTE_AGENT_SOURCE_DIR' reset --hard 'origin/$REMOTE_AGENT_SOURCE_BRANCH'
      git -C '$REMOTE_AGENT_SOURCE_DIR' clean -fd
    else
      rm -rf '$REMOTE_AGENT_SOURCE_DIR'
      git clone --depth=1 --branch '$REMOTE_AGENT_SOURCE_BRANCH' '$REMOTE_AGENT_SOURCE_REPO_URL' '$REMOTE_AGENT_SOURCE_DIR'
    fi
    git -C '$REMOTE_AGENT_SOURCE_DIR' rev-parse --short HEAD
  "
}

validate_remote_runtime() {
  echo "==> 校验服务器运行态配置..."
  ssh_cmd "
    set -e
    test -f '$REMOTE_WORKSPACE_CONFIG_DIR/.env'
    test -f '$REMOTE_WORKSPACE_CONFIG_DIR/config/pharma-qc/product_stage_tests.json'
    test -d '$REMOTE_WORKSPACE_CONFIG_DIR/config/pharma-qc/full'
    test -d '$REMOTE_WORKSPACE_CONFIG_DIR/config/pharma-qc/records'
    grep -q '^WORKSPACE_CONFIG_DIR=' '$REMOTE_WORKSPACE_CONFIG_DIR/.env'
    grep -q '^DATABASE_URL=' '$REMOTE_WORKSPACE_CONFIG_DIR/.env'
    grep -q '^DIRECT_URL=' '$REMOTE_WORKSPACE_CONFIG_DIR/.env'
    grep -q '^AGENT_SOURCE_WORKTREE=' '$REMOTE_WORKSPACE_CONFIG_DIR/.env'
    grep -q '^LIBRARY_SOURCE_ROOT=' '$REMOTE_WORKSPACE_CONFIG_DIR/.env'
    grep -q '^LIBRARY_ROOT=' '$REMOTE_WORKSPACE_CONFIG_DIR/.env'
    if grep -Eq '^(AGENT_MODEL_PROVIDER|KIMI_API_KEY|KIMI_BASE_URL|KIMI_MODEL|KIMI_MAX_TOKENS|DEEPSEEK_API_KEY|DEEPSEEK_BASE_URL|DEEPSEEK_MODEL)=' '$REMOTE_WORKSPACE_CONFIG_DIR/.env'; then
      echo '[错误] 服务器仍包含已废弃的自研 Agent provider 配置'
      exit 1
    fi
    WORKSPACE_CONFIG_DIR='$REMOTE_WORKSPACE_CONFIG_DIR' '$REMOTE_WORKSPACE_CONFIG_DIR/runtime/kimi-agent-bootstrap/install-kimi-agent-runtime.sh' --check
    test -d '$REMOTE_AGENT_SOURCE_DIR/.git'
    python3 - <<'PY'
from pathlib import Path
import os
import sys

env = {}
for line in Path('$REMOTE_WORKSPACE_CONFIG_DIR/.env').read_text().splitlines():
    if not line or line.lstrip().startswith('#') or '=' not in line:
        continue
    key, value = line.split('=', 1)
    env[key] = value.strip().strip('\"').strip(\"'\")

workspace = env.get('WORKSPACE_CONFIG_DIR', '')
database = env.get('DATABASE_URL', '')
direct_database = env.get('DIRECT_URL', '')
agent_source = env.get('AGENT_SOURCE_WORKTREE', '')
library_source_root = env.get('LIBRARY_SOURCE_ROOT', '')
library_root = env.get('LIBRARY_ROOT', '')
cutover_source = env.get('SQLITE_CUTOVER_SOURCE', '')
rollback_env_value = env.get('SQLITE_CUTOVER_ROLLBACK_ENV', '')
if not workspace:
    sys.exit('WORKSPACE_CONFIG_DIR missing from remote .env')
if not os.path.isabs(workspace):
    sys.exit(f'WORKSPACE_CONFIG_DIR must be absolute: {workspace}')
from urllib.parse import unquote, urlparse
database_url = urlparse(database)
direct_url = urlparse(direct_database)
if database_url.scheme not in {'postgres', 'postgresql'}:
    sys.exit('DATABASE_URL must use PostgreSQL')
if direct_url.scheme not in {'postgres', 'postgresql'}:
    sys.exit('DIRECT_URL must use PostgreSQL')
if not database_url.hostname or not database_url.path or database_url.path == '/':
    sys.exit('DATABASE_URL must include host and database name')
if not direct_url.hostname or not direct_url.path or direct_url.path == '/':
    sys.exit('DIRECT_URL must include host and database name')
database_endpoint = (database_url.hostname, database_url.port or 5432, database_url.path)
direct_endpoint = (direct_url.hostname, direct_url.port or 5432, direct_url.path)
if database_endpoint != direct_endpoint:
    sys.exit('DATABASE_URL and DIRECT_URL must select the same PostgreSQL host, port, and database')
if cutover_source:
    active_env_path = Path('$REMOTE_WORKSPACE_CONFIG_DIR/.env').resolve()
    rollback_env_path = Path(rollback_env_value)
    if not rollback_env_path.is_absolute():
        sys.exit('SQLITE_CUTOVER_ROLLBACK_ENV must be absolute')
    if not rollback_env_path.is_file():
        sys.exit(f'SQLITE_CUTOVER_ROLLBACK_ENV is not a readable file: {rollback_env_path}')
    if rollback_env_path.resolve() == active_env_path:
        sys.exit('SQLITE_CUTOVER_ROLLBACK_ENV must not point at the active PostgreSQL .env')
    rollback_env = {}
    for line in rollback_env_path.read_text().splitlines():
        if not line or line.lstrip().startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        rollback_env[key] = value.strip().strip('\"').strip(\"'\")
    for required_key in ('DATABASE_URL', 'NEXTAUTH_SECRET', 'WORKSPACE_CONFIG_DIR'):
        if not rollback_env.get(required_key):
            sys.exit(f'{required_key} missing from SQLITE_CUTOVER_ROLLBACK_ENV')
    rollback_database_url = urlparse(rollback_env['DATABASE_URL'])
    rollback_database_path = Path(unquote(rollback_database_url.path))
    if rollback_database_url.scheme != 'file' or not rollback_database_path.is_absolute():
        sys.exit('rollback DATABASE_URL must be file:<absolute-sqlite-path>')
    if not rollback_database_path.is_file():
        sys.exit(f'rollback SQLite database does not exist: {rollback_database_path}')
    if rollback_env['WORKSPACE_CONFIG_DIR'] != workspace:
        sys.exit('rollback WORKSPACE_CONFIG_DIR must match the active runtime directory')
if not os.path.isabs(library_root):
    sys.exit(f'LIBRARY_ROOT must be absolute: {library_root}')
if not library_root.startswith(os.path.join(workspace, 'library') + os.sep) and library_root != os.path.join(workspace, 'library'):
    sys.exit(f'LIBRARY_ROOT must live under WORKSPACE_CONFIG_DIR/library: {library_root}')
if not os.path.isabs(library_source_root):
    sys.exit(f'LIBRARY_SOURCE_ROOT must be absolute: {library_source_root}')
expected_library_source = os.path.join(workspace, 'library', 'originals')
if library_source_root != expected_library_source:
    sys.exit(f'LIBRARY_SOURCE_ROOT must equal WORKSPACE_CONFIG_DIR/library/originals: {library_source_root}')
if not agent_source:
    sys.exit('AGENT_SOURCE_WORKTREE missing from remote .env')
if not os.path.isabs(agent_source):
    sys.exit(f'AGENT_SOURCE_WORKTREE must be absolute: {agent_source}')
if not os.path.isdir(os.path.join(agent_source, '.git')):
    sys.exit(f'AGENT_SOURCE_WORKTREE must point to a git worktree: {agent_source}')
print('Remote runtime env check passed.')
PY
    set -a
    . '$REMOTE_WORKSPACE_CONFIG_DIR/.env'
    set +a
    if [ -n \"\${SQLITE_CUTOVER_SOURCE:-}\" ]; then
      case \"\${SQLITE_CUTOVER_ROLLBACK_ENV:-}\" in /*) ;; *) echo '[错误] SQLITE_CUTOVER_ROLLBACK_ENV 必须是绝对路径'; exit 1 ;; esac
      test -r \"\$SQLITE_CUTOVER_ROLLBACK_ENV\"
    fi
    command -v psql >/dev/null
    command -v pg_dump >/dev/null
    command -v pg_restore >/dev/null
    pg_isready --dbname="\$DIRECT_URL" >/dev/null
    psql "\$DIRECT_URL" -v ON_ERROR_STOP=1 -Atc 'SELECT 1' >/dev/null
    psql "\$DATABASE_URL" -v ON_ERROR_STOP=1 -Atc 'SELECT 1' >/dev/null
    direct_identity=\$(psql "\$DIRECT_URL" -v ON_ERROR_STOP=1 -Atc \"SELECT current_database() || '|' || COALESCE(inet_server_addr()::text, 'local') || '|' || inet_server_port()::text\")
    runtime_identity=\$(psql "\$DATABASE_URL" -v ON_ERROR_STOP=1 -Atc \"SELECT current_database() || '|' || COALESCE(inet_server_addr()::text, 'local') || '|' || inet_server_port()::text\")
    if [ "\$direct_identity" != "\$runtime_identity" ]; then
      echo '[错误] DATABASE_URL 与 DIRECT_URL 连接到不同的 PostgreSQL 实例'
      exit 1
    fi
  "
}

backup_remote_postgresql() {
  echo "==> 创建并验证 PostgreSQL 逻辑备份..."
  ssh_cmd "
    set -e
    umask 077
    mkdir -p '$REMOTE_BACKUP_DIR'
    set -a
    . '$REMOTE_WORKSPACE_CONFIG_DIR/.env'
    set +a
    stamp=\$(date +%Y%m%d%H%M%S)
    backup='$REMOTE_BACKUP_DIR/workspace-postgresql-'\$stamp'.dump'
    pg_dump --format=custom --no-owner --no-privileges --file=\"\$backup\" \"\$DIRECT_URL\"
    pg_restore --list \"\$backup\" >/dev/null
    if command -v sha256sum >/dev/null 2>&1; then
      sha256sum \"\$backup\" > \"\$backup.sha256\"
    else
      shasum -a 256 \"\$backup\" > \"\$backup.sha256\"
    fi
    test -s \"\$backup\"
    test -s \"\$backup.sha256\"
    ls -lh \"\$backup\"
  "
}

backup_remote_runtime() {
  echo "==> 创建服务器运行态增量快照..."
  ssh_cmd "
    set -e
    command -v rsync >/dev/null
    mkdir -p '$REMOTE_RUNTIME_SNAPSHOT_DIR'
    if [ -d '$REMOTE_WORKSPACE_CONFIG_DIR' ]; then
      stamp=\$(date +%Y%m%d%H%M%S)
      snapshot='$REMOTE_RUNTIME_SNAPSHOT_DIR/'\$stamp
      snapshot_tmp='$REMOTE_RUNTIME_SNAPSHOT_DIR/.'\$stamp'.tmp'
      previous=\$(find '$REMOTE_RUNTIME_SNAPSHOT_DIR' -mindepth 1 -maxdepth 1 -type d -name '20*' -printf '%f\\n' | sort | tail -n 1)
      rm -rf \"\$snapshot_tmp\"
      mkdir -p \"\$snapshot_tmp\"
      trap 'rm -rf \"\$snapshot_tmp\"' EXIT
      if [ -n \"\$previous\" ]; then
        rsync -a --delete --link-dest=\"$REMOTE_RUNTIME_SNAPSHOT_DIR/\$previous\" '$REMOTE_WORKSPACE_CONFIG_DIR/' \"\$snapshot_tmp/\"
      else
        rsync -a --delete '$REMOTE_WORKSPACE_CONFIG_DIR/' \"\$snapshot_tmp/\"
      fi
      mv \"\$snapshot_tmp\" \"\$snapshot\"
      trap - EXIT
      du -sh \"\$snapshot\"
    else
      echo '[警告] 运行态目录不存在，跳过备份: $REMOTE_WORKSPACE_CONFIG_DIR'
    fi
  "
}

cleanup_remote_backups() {
  echo "==> 清理服务器备份（每类保留 ${BACKUP_RETENTION_DAYS} 天，最多 ${BACKUP_RETENTION_COUNT} 份）..."
  ssh_cmd "
    set -e
    mkdir -p '$REMOTE_BACKUP_DIR'
    python3 - <<'PY'
from pathlib import Path
import shutil
import time

backup_dir = Path('$REMOTE_BACKUP_DIR')
runtime_snapshot_dir = backup_dir / 'workspace-runtime-snapshots'
retention_days = int('$BACKUP_RETENTION_DAYS')
retention_count = int('$BACKUP_RETENTION_COUNT')
now = time.time()
cutoff = now - retention_days * 86400
if runtime_snapshot_dir.is_dir():
    snapshots = sorted(
        (path for path in runtime_snapshot_dir.iterdir() if path.is_dir() and path.name.startswith('20')),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    for index, path in enumerate(snapshots):
        too_many = index >= retention_count
        too_old = retention_days > 0 and path.stat().st_mtime < cutoff
        if too_many or too_old:
            shutil.rmtree(path)
    for path in runtime_snapshot_dir.glob('.*.tmp'):
        shutil.rmtree(path, ignore_errors=True)
    remaining_snapshots = [path for path in runtime_snapshot_dir.iterdir() if path.is_dir() and path.name.startswith('20')]
    print(f'runtime snapshots kept: {len(remaining_snapshots)}')
    if remaining_snapshots:
        for path in backup_dir.glob('workspace-runtime-*.tgz'):
            path.unlink()
        print('legacy runtime tarballs removed')

for pattern in ('workspace-postgresql-*.dump',):
    files = sorted(backup_dir.glob(pattern), key=lambda path: path.stat().st_mtime, reverse=True)
    for index, path in enumerate(files):
        too_many = index >= retention_count
        too_old = retention_days > 0 and path.stat().st_mtime < cutoff
        if too_many or too_old:
            checksum = Path(str(path) + '.sha256')
            path.unlink()
            if checksum.exists():
                checksum.unlink()
    print(f'{pattern} backups kept: {len(list(backup_dir.glob(pattern)))}')
PY
  "
}

deploy_remote_artifact() {
  local release_id
  local remote_tar
  release_id="$(date +%Y%m%d%H%M%S)-$(git rev-parse --short HEAD 2>/dev/null || echo manual)"
  remote_tar="$REMOTE_WORKSPACE_CONFIG_DIR/deploy-workspace-standalone-$release_id.tgz"

  echo "==> 上传 CNB 构建产物到服务器..."
  rsync -avz -e "$RSYNC_SSH_COMMAND" \
    "$ARTIFACT_PATH" "$SERVER:$remote_tar"

  echo "==> 服务器解包产物并重启服务..."
  ssh_cmd "
    set -e
    mkdir -p '$REMOTE_DIR/releases'
    old_release=\$(readlink -f '$REMOTE_DIR/current' 2>/dev/null || true)
    find '$REMOTE_DIR' -mindepth 1 -maxdepth 1 ! -name current ! -name releases ! -name .workspace ! -name .workspace.backups ! -name '$REMOTE_AGENT_SOURCE_ROOT_NAME' -exec rm -rf {} +
    release_dir='$REMOTE_DIR/releases/$release_id'
    rm -rf \"\$release_dir\"
    mkdir -p \"\$release_dir\"
    tar -xzf '$remote_tar' -C \"\$release_dir\"
    rm -f '$remote_tar'

    server_entry=\$(cat \"\$release_dir/.server-entry\" 2>/dev/null || printf 'server.js')
    app_dir=\$(dirname \"\$release_dir/\$server_entry\")
    test -f \"\$release_dir/\$server_entry\"

    ln -sfn '../../.workspace/.env' \"\$release_dir/.env\"
    ln -sfn \"\$(realpath --relative-to=\"\$app_dir\" '$REMOTE_WORKSPACE_CONFIG_DIR/.env')\" \"\$app_dir/.env\"
    rm -rf \"\$release_dir/data\" \"\$app_dir/data\"

    if [ -d '$REMOTE_WORKSPACE_CONFIG_DIR/assets/brand/company' ]; then
      rm -rf \"\$app_dir/public/company\"
      mkdir -p \"\$app_dir/public\"
      ln -sfn \"\$(realpath --relative-to=\"\$app_dir/public\" '$REMOTE_WORKSPACE_CONFIG_DIR/assets/brand/company')\" \"\$app_dir/public/company\"
    fi

    if [ -d '$REMOTE_WORKSPACE_CONFIG_DIR/assets/agent/avatar' ]; then
      mkdir -p \"\$app_dir/public/assets/agent\"
      rm -rf \"\$app_dir/public/assets/agent/avatar\"
      ln -sfn \"\$(realpath --relative-to=\"\$app_dir/public/assets/agent\" '$REMOTE_WORKSPACE_CONFIG_DIR/assets/agent/avatar')\" \"\$app_dir/public/assets/agent/avatar\"
    fi

    if [ -d '$REMOTE_WORKSPACE_CONFIG_DIR/assets/user/avatar' ]; then
      mkdir -p \"\$app_dir/public/assets/user\"
      rm -rf \"\$app_dir/public/assets/user/avatar\"
      ln -sfn \"\$(realpath --relative-to=\"\$app_dir/public/assets/user\" '$REMOTE_WORKSPACE_CONFIG_DIR/assets/user/avatar')\" \"\$app_dir/public/assets/user/avatar\"
    fi

    grep -q '^WORKSPACE_CONFIG_DIR=' \"\$release_dir/.env\"
    grep -q '^DATABASE_URL=' \"\$release_dir/.env\"
    grep -q '^DIRECT_URL=' \"\$release_dir/.env\"
    test -f \"\$release_dir/prisma/schema.prisma\"
    test -f \"\$release_dir/prisma/migrations/migration_lock.toml\"
    test -f \"\$release_dir/scripts/check/check-prisma-deploy-status.js\"
    test -f \"\$release_dir/scripts/migrate/sqlite-to-postgresql.mjs\"
    test -f \"\$release_dir/node_modules/prisma/build/index.js\"
    test -f \"\$release_dir/resource-defs.json\"
    test -f \"\$release_dir/seed-resources-runtime.mjs\"
    test -f \"\$release_dir/scripts/check/check-permission-action-grants.mjs\"

    cd \"\$release_dir\"
    set -a
    . \"\$release_dir/.env\"
    set +a
    export NODE_ENV=production
    cutover_source=\"\${SQLITE_CUTOVER_SOURCE:-}\"
    cutover_rollback_env=\"\${SQLITE_CUTOVER_ROLLBACK_ENV:-}\"
    cutover_public_switched=0
    cutover_public_wal_lsn=''
    cutover_candidate_name='$PM2_NAME-candidate'
    pm2_pid_or_unavailable() {
      local process_name=\$1
      local process_list
      process_list=\$(pm2 jlist 2>/dev/null) || {
        printf '__unavailable__'
        return
      }
      PROCESS_NAME=\"\$process_name\" PROCESS_LIST=\"\$process_list\" python3 - <<'PY'
import json
import os

try:
    processes = json.loads(os.environ['PROCESS_LIST'])
    if not isinstance(processes, list) or any(not isinstance(item, dict) for item in processes):
        raise ValueError('pm2 jlist did not return a process object list')
    matches = [item for item in processes if item.get('name') == os.environ['PROCESS_NAME']]
    if not matches:
        print('0')
    elif len(matches) != 1:
        print('__unavailable__')
    else:
        item = matches[0]
        pid = item.get('pid') or 0
        status = item.get('pm2_env', {}).get('status')
        if status == 'stopped' and pid == 0:
            print('0')
        elif status == 'online' and isinstance(pid, int) and pid > 0:
            print(pid)
        else:
            print('__unavailable__')
except Exception:
    print('__unavailable__')
PY
    }
    if [ -n \"\$cutover_source\" ]; then
      case \"\$cutover_rollback_env\" in /*) ;; *) echo '[错误] SQLITE_CUTOVER_ROLLBACK_ENV 必须是绝对路径'; exit 1 ;; esac
      test -r \"\$cutover_rollback_env\"
      test -n \"\$old_release\"
      test -f \"\$old_release/.server-entry\"
      if [ \"\$(pm2_pid_or_unavailable \"\$cutover_candidate_name\")\" != '0' ] || [ \"\$(pm2_pid_or_unavailable '$PM2_NAME')\" != '0' ] || [ \"\$(pm2_pid_or_unavailable '$PM2_WECOM_BOT_NAME')\" != '0' ]; then
        echo '[错误] SQLite cutover 前必须先停止 candidate、Workspace 与企业微信 PM2 writer'
        exit 1
      fi
    fi
    rollback_cutover() {
      exit_code=\$?
      trap - EXIT
      if [ \"\$exit_code\" -ne 0 ] && [ -n \"\$cutover_source\" ] && [ \"\$cutover_public_switched\" = '0' ]; then
        pm2 delete \"\$cutover_candidate_name\" 2>/dev/null || true
        pm2 delete '$PM2_NAME' 2>/dev/null || true
        pm2 delete '$PM2_WECOM_BOT_NAME' 2>/dev/null || true
        rollback_candidate_pid=\$(pm2_pid_or_unavailable \"\$cutover_candidate_name\")
        rollback_public_pid=\$(pm2_pid_or_unavailable '$PM2_NAME')
        rollback_wecom_pid=\$(pm2_pid_or_unavailable '$PM2_WECOM_BOT_NAME')
        if [ \"\$rollback_candidate_pid\" != '0' ] || [ \"\$rollback_public_pid\" != '0' ] || [ \"\$rollback_wecom_pid\" != '0' ]; then
          cutover_public_switched=1
          echo '[错误] PostgreSQL candidate/public/WeCom writer 未能全部确认停止；禁止自动回退 SQLite。'
        elif [ -n \"\$cutover_public_wal_lsn\" ]; then
          rollback_final_wal_lsn=\$(psql \"\$DIRECT_URL\" -v ON_ERROR_STOP=1 -Atc 'SELECT pg_current_wal_lsn()' 2>/dev/null || printf '__unavailable__')
          if [ \"\$rollback_final_wal_lsn\" != \"\$cutover_public_wal_lsn\" ]; then
            cutover_public_switched=1
            echo '[错误] PostgreSQL 3000 writer 已停止，但最终 WAL 与对外启动前不同；为防止数据丢失，禁止自动回退 SQLite。'
          fi
        fi
        if [ \"\$cutover_public_switched\" = '0' ]; then
          echo '[回滚] PostgreSQL writer 已停止且 WAL 未变化，恢复旧 SQLite env 与旧 release。'
          cp \"\$cutover_rollback_env\" '$REMOTE_WORKSPACE_CONFIG_DIR/.env.rollback.tmp'
          chmod 600 '$REMOTE_WORKSPACE_CONFIG_DIR/.env.rollback.tmp'
          mv '$REMOTE_WORKSPACE_CONFIG_DIR/.env.rollback.tmp' '$REMOTE_WORKSPACE_CONFIG_DIR/.env'
          set -a
          . '$REMOTE_WORKSPACE_CONFIG_DIR/.env'
          set +a
          old_server_entry=\$(cat \"\$old_release/.server-entry\" 2>/dev/null || printf 'server.js')
          old_app_dir=\$(dirname \"\$old_release/\$old_server_entry\")
          pm2 start \"\$old_release/\$old_server_entry\" --name '$PM2_NAME' --cwd \"\$old_app_dir\" --update-env
          rollback_ready=0
          for i in \$(seq 1 20); do
            if curl -fsS '$HEALTHCHECK_URL' >/dev/null; then
              rollback_ready=1
              break
            fi
            sleep 1
          done
          if [ \"\$rollback_ready\" != '1' ]; then
            echo '[错误] 旧 SQLite release 已尝试恢复，但 3000 端口健康检查失败。'
            pm2 logs '$PM2_NAME' --lines 80 --nostream || true
          fi
          if [ -n \"\${WECHAT_BOT_ID:-}\" ] && [ -n \"\${WECHAT_BOT_SECRET:-}\" ] && [ -f \"\$old_release/scripts/runtime/wecom-agent-bot.mjs\" ]; then
            pm2 start \"\$old_release/scripts/runtime/wecom-agent-bot.mjs\" --name '$PM2_WECOM_BOT_NAME' --cwd \"\$old_release\" --update-env
          fi
          pm2 save
        fi
      fi
      exit \"\$exit_code\"
    }
    trap rollback_cutover EXIT
    echo '==> 检查 Prisma migration 状态...'
    node \"\$release_dir/scripts/check/check-prisma-deploy-status.js\" --migrations-dir \"\$release_dir/prisma/migrations\" --allow-pending
    echo '==> 执行 Prisma 数据库迁移...'
    node \"\$release_dir/node_modules/prisma/build/index.js\" migrate deploy --schema=\"\$release_dir/prisma\"
    if [ -n \"\${SQLITE_CUTOVER_SOURCE:-}\" ]; then
      if [ -z \"\${SQLITE_CUTOVER_SHA256:-}\" ]; then
        echo '[错误] 配置了 SQLITE_CUTOVER_SOURCE 但缺少 SQLITE_CUTOVER_SHA256'
        exit 1
      fi
      if [ -z \"\${SQLITE_CUTOVER_ROLLBACK_ENV:-}\" ]; then
        echo '[错误] 配置了 SQLITE_CUTOVER_SOURCE 但缺少 SQLITE_CUTOVER_ROLLBACK_ENV'
        exit 1
      fi
      if ! printf '%s' \"\$SQLITE_CUTOVER_SHA256\" | grep -Eq '^[0-9a-f]{64}$'; then
        echo '[错误] SQLITE_CUTOVER_SHA256 必须是 64 位小写十六进制 SHA-256'
        exit 1
      fi
      case \"\$SQLITE_CUTOVER_SOURCE\" in /*) ;; *) echo '[错误] SQLITE_CUTOVER_SOURCE 必须是绝对路径'; exit 1 ;; esac
      test -r \"\$SQLITE_CUTOVER_SOURCE\"
      cutover_manifest=\"\${SQLITE_CUTOVER_MANIFEST:-$REMOTE_BACKUP_DIR/postgresql-cutover/postgresql-execute.json}\"
      case \"\$cutover_manifest\" in /*) ;; *) echo '[错误] SQLITE_CUTOVER_MANIFEST 必须是绝对路径'; exit 1 ;; esac
      mkdir -p \"\$(dirname \"\$cutover_manifest\")\"
      cutover_dry_run_manifest=\"\$cutover_manifest.dry-run.json\"
      echo '==> 预演一次性 SQLite 到 PostgreSQL 数据切换...'
      node \"\$release_dir/scripts/migrate/sqlite-to-postgresql.mjs\" \\
        --sqlite \"\$SQLITE_CUTOVER_SOURCE\" \\
        --target \"\$DIRECT_URL\" \\
        --expected-source-sha256 \"\$SQLITE_CUTOVER_SHA256\" \\
        --manifest \"\$cutover_dry_run_manifest\"
      echo '==> 执行一次性 SQLite 到 PostgreSQL 数据切换...'
      node \"\$release_dir/scripts/migrate/sqlite-to-postgresql.mjs\" \\
        --sqlite \"\$SQLITE_CUTOVER_SOURCE\" \\
        --target \"\$DIRECT_URL\" \\
        --expected-source-sha256 \"\$SQLITE_CUTOVER_SHA256\" \\
        --manifest \"\$cutover_manifest\" \\
        --execute
      psql \"\$DIRECT_URL\" -v ON_ERROR_STOP=1 -c \"INSERT INTO \\\"SystemConfig\\\" (\\\"key\\\", \\\"value\\\") VALUES ('database.cutover.marker', '\$SQLITE_CUTOVER_SHA256') ON CONFLICT (\\\"key\\\") DO UPDATE SET \\\"value\\\" = EXCLUDED.\\\"value\\\"\" >/dev/null
      python3 - '$REMOTE_WORKSPACE_CONFIG_DIR/.env' \"\$cutover_manifest\" \"\$SQLITE_CUTOVER_SHA256\" <<'PY'
import json
import os
from pathlib import Path
import sys

env_path = Path(sys.argv[1])
manifest_path = Path(sys.argv[2])
source_sha256 = sys.argv[3]
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
if manifest.get('status') != 'success' or manifest.get('mode') != 'execute':
    raise SystemExit('SQLite cutover manifest is not a successful execute manifest')
if manifest.get('source', {}).get('sha256After') != source_sha256:
    raise SystemExit('SQLite cutover manifest source hash does not match the frozen source')
keys = {'SQLITE_CUTOVER_SOURCE', 'SQLITE_CUTOVER_SHA256', 'SQLITE_CUTOVER_MANIFEST', 'SQLITE_CUTOVER_ROLLBACK_ENV'}
lines = [line for line in env_path.read_text(encoding='utf-8').splitlines() if line.split('=', 1)[0].strip() not in keys]
temporary = env_path.with_suffix('.env.cutover.tmp')
temporary.write_text('\n'.join(lines).rstrip() + '\n', encoding='utf-8')
os.chmod(temporary, 0o600)
temporary.replace(env_path)
receipt = manifest_path.with_suffix(manifest_path.suffix + '.complete')
receipt.write_text(f'{source_sha256}  {manifest_path.name}\n', encoding='utf-8')
os.chmod(receipt, 0o600)
PY
      unset SQLITE_CUTOVER_SOURCE SQLITE_CUTOVER_SHA256 SQLITE_CUTOVER_MANIFEST SQLITE_CUTOVER_ROLLBACK_ENV
      echo '==> SQLite 一次性切换完成，切换变量已从运行态配置移除。'
    fi
    node \"\$release_dir/scripts/check/check-prisma-deploy-status.js\" --migrations-dir \"\$release_dir/prisma/migrations\"
    echo '==> 同步 RBAC resource registry...'
    node \"\$release_dir/seed-resources-runtime.mjs\" \"\$release_dir/resource-defs.json\"
    echo '==> 校验 RBAC action grant 数据...'
    node \"\$release_dir/scripts/check/check-permission-action-grants.mjs\" \"\$release_dir/resource-defs.json\"
    user_count=\$(psql \"\$DIRECT_URL\" -v ON_ERROR_STOP=1 -Atc 'SELECT count(*) FROM \"User\";')
    invalid_constraint_count=\$(psql \"\$DIRECT_URL\" -v ON_ERROR_STOP=1 -Atc 'SELECT count(*) FROM pg_constraint WHERE connamespace = '\''public'\''::regnamespace AND NOT convalidated;')
    if [ \"\$user_count\" -lt 1 ]; then
      echo '[错误] PostgreSQL 中没有用户数据，拒绝启动生产服务'
      exit 1
    fi
    if [ \"\$invalid_constraint_count\" -ne 0 ]; then
      echo '[错误] PostgreSQL 存在未验证约束，拒绝启动生产服务'
      exit 1
    fi
    direct_fingerprint=\$(psql \"\$DIRECT_URL\" -v ON_ERROR_STOP=1 -Atc \"SELECT (SELECT value FROM \\\"SystemConfig\\\" WHERE key = 'database.cutover.marker') || '|' || (SELECT checksum FROM \\\"_prisma_migrations\\\" WHERE migration_name = '20260713000000_postgresql_baseline' AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1) || '|' || (SELECT count(*)::text || ':' || COALESCE(min(id), 0)::text || ':' || COALESCE(max(id), 0)::text FROM \\\"User\\\") || '|' || (SELECT count(*)::text || ':' || COALESCE(min(id), 0)::text || ':' || COALESCE(max(id), 0)::text FROM \\\"Resource\\\") || '|' || (SELECT count(*)::text || ':' || COALESCE(min(id), 0)::text || ':' || COALESCE(max(id), 0)::text FROM \\\"FinanceVoucherItem\\\")\")
    runtime_fingerprint=\$(psql \"\$DATABASE_URL\" -v ON_ERROR_STOP=1 -Atc \"SELECT (SELECT value FROM \\\"SystemConfig\\\" WHERE key = 'database.cutover.marker') || '|' || (SELECT checksum FROM \\\"_prisma_migrations\\\" WHERE migration_name = '20260713000000_postgresql_baseline' AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1) || '|' || (SELECT count(*)::text || ':' || COALESCE(min(id), 0)::text || ':' || COALESCE(max(id), 0)::text FROM \\\"User\\\") || '|' || (SELECT count(*)::text || ':' || COALESCE(min(id), 0)::text || ':' || COALESCE(max(id), 0)::text FROM \\\"Resource\\\") || '|' || (SELECT count(*)::text || ':' || COALESCE(min(id), 0)::text || ':' || COALESCE(max(id), 0)::text FROM \\\"FinanceVoucherItem\\\")\")
    if [ -z \"\$direct_fingerprint\" ] || [ \"\$direct_fingerprint\" != \"\$runtime_fingerprint\" ]; then
      echo '[错误] DATABASE_URL 与 DIRECT_URL 的切换标记、migration checksum 或核心数据指纹不一致'
      exit 1
    fi

    pm2 delete \"\$cutover_candidate_name\" 2>/dev/null || true
    PORT=3101 HOSTNAME=127.0.0.1 pm2 start \"\$release_dir/\$server_entry\" --name \"\$cutover_candidate_name\" --cwd \"\$app_dir\" --update-env
    qc_cache_ready=0
    for i in \$(seq 1 20); do
      if curl -fsS -X POST -H \"x-qc-cache-warmup: \$NEXTAUTH_SECRET\" 'http://127.0.0.1:3101/workspace/api/modules/production/qc/cache' >/dev/null; then
        qc_cache_ready=1
        break
      fi
      sleep 1
    done
    if [ \"\$qc_cache_ready\" != \"1\" ]; then
      echo '[错误] QC 模板缓存预热失败'
      pm2 logs \"\$cutover_candidate_name\" --lines 80 --nostream || true
      exit 1
    fi
    pm2 delete \"\$cutover_candidate_name\" 2>/dev/null || true
    if [ \"\$(pm2_pid_or_unavailable \"\$cutover_candidate_name\")\" != '0' ]; then
      echo '[错误] PostgreSQL candidate writer 未能确认停止，拒绝启动公网进程'
      exit 1
    fi
    pm2 delete '$PM2_NAME' 2>/dev/null || true
    if [ \"\$(pm2_pid_or_unavailable '$PM2_NAME')\" != '0' ]; then
      echo '[错误] PostgreSQL public writer 未能确认停止，拒绝记录 WAL 基线'
      exit 1
    fi
    if [ -n \"\$cutover_source\" ]; then
      cutover_public_wal_lsn=\$(psql \"\$DIRECT_URL\" -v ON_ERROR_STOP=1 -Atc 'SELECT pg_current_wal_lsn()')
    fi
    PORT=3000 HOSTNAME=0.0.0.0 pm2 start \"\$release_dir/\$server_entry\" --name '$PM2_NAME' --cwd \"\$app_dir\" --update-env
    public_ready=0
    for i in \$(seq 1 20); do
      if curl -fsS '$HEALTHCHECK_URL' >/dev/null && curl -fsS -X POST -H \"x-qc-cache-warmup: \$NEXTAUTH_SECRET\" 'http://127.0.0.1:3000/workspace/api/modules/production/qc/cache' >/dev/null; then
        public_ready=1
        break
      fi
      sleep 1
    done
    if [ \"\$public_ready\" != '1' ]; then
      pm2 logs '$PM2_NAME' --lines 80 --nostream || true
      exit 1
    fi
    cutover_public_switched=1
    ln -sfn \"\$release_dir\" '$REMOTE_DIR/current'
    pm2 delete '$PM2_WECOM_BOT_NAME' 2>/dev/null || true
    if [ -n "\${WECHAT_BOT_ID:-}" ] && [ -n "\${WECHAT_BOT_SECRET:-}" ]; then
      pm2 start "\$release_dir/scripts/runtime/wecom-agent-bot.mjs" --name '$PM2_WECOM_BOT_NAME' --cwd "\$release_dir" --update-env
    else
      echo '==> 跳过企业微信智能机器人：WECHAT_BOT_ID/WECHAT_BOT_SECRET 未配置'
    fi
    pm2 save
    find '$REMOTE_DIR/releases' -mindepth 1 -maxdepth 1 -type d | sort -r | tail -n +6 | xargs -r rm -rf
    pm2 status
  "
}

run_healthcheck() {
  echo "==> 健康检查..."
  ssh_cmd "curl -fsS '$HEALTHCHECK_URL' >/dev/null"
}

notify_workspace_bot_deploy() {
  echo "==> 记录 Workspace 更新通知..."
  ssh_cmd "REMOTE_DIR='$REMOTE_DIR' python3 - <<'PY'
import datetime
import json
import os
from pathlib import Path

remote_dir = Path(os.environ['REMOTE_DIR'])
current = remote_dir / 'current'
release_path = current.resolve()
app_dir = current / 'workspace'

def read_json(path):
    try:
        return json.loads(path.read_text())
    except Exception:
        return {}

package = read_json(app_dir / 'package.json').get('version') or 'unknown'
build = (app_dir / '.next' / 'BUILD_ID').read_text().strip() if (app_dir / '.next' / 'BUILD_ID').exists() else 'unknown'
required = read_json(app_dir / '.next' / 'required-server-files.json')
build = required.get('config', {}).get('env', {}).get('NEXT_PUBLIC_BUILD_VERSION') or build
release = release_path.name

payload = {
    'id': f'{release}:{build}',
    'package': str(package),
    'build': str(build),
    'release': release,
    'finishedAt': datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
}
target = Path.home() / '.finance-bot-deploy-event.json'
tmp = target.with_suffix('.json.tmp')
tmp.write_text(json.dumps(payload, ensure_ascii=False))
tmp.replace(target)
print(f\"Workspace deploy event recorded: {payload['id']}\")
PY"
}

if [ "$RUN_LOCAL_CHECKS" = "1" ] && ! command -v npm >/dev/null 2>&1; then
  echo "==> 当前 CI 容器未提供 npm，自动跳过本地静态检查"
  RUN_LOCAL_CHECKS=0
fi

echo "==> 校验 CI 基础命令..."
require_local_cmd ssh
require_local_cmd rsync
require_local_cmd tar
echo "==> ssh: $(command -v ssh)"
echo "==> rsync: $(command -v rsync)"

if [ "$RUN_LOCAL_CHECKS" = "1" ]; then
  run_local_checks
else
  echo "==> 跳过本地静态检查（RUN_LOCAL_CHECKS=${RUN_LOCAL_CHECKS}）"
fi

echo "==> 强制校验 Prisma migrations..."
if [ "$RUN_LOCAL_CHECKS" = "1" ]; then
  npm run db:migration:check
else
  node scripts/check/check-prisma-migrations.js --static
fi

build_artifact

echo "==> 验证服务器连接..."
start_ssh_master
ssh_cmd "echo CONNECTED && whoami && mkdir -p '$REMOTE_DIR'"

prepare_remote_runtime
ensure_remote_library_runtime_deps
ensure_remote_kimi_agent_runtime
sync_remote_library_source
sync_remote_agent_source
validate_remote_runtime
backup_remote_postgresql
backup_remote_runtime
cleanup_remote_backups
deploy_remote_artifact
run_healthcheck
notify_workspace_bot_deploy

echo ""
echo "==> CNB 产物部署完成"
