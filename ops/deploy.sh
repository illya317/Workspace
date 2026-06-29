#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

SERVER="${SERVER:-}"
REMOTE_DIR="${REMOTE_DIR:-}"
PM2_NAME="${PM2_NAME:-workspace}"
REMOTE_WORKSPACE_CONFIG_DIR="${REMOTE_WORKSPACE_CONFIG_DIR:-}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-}"
RUN_LOCAL_CHECKS="${RUN_LOCAL_CHECKS:-1}"
ALLOW_NON_LINUX_BUILD="${ALLOW_NON_LINUX_BUILD:-0}"
ENV_CONTENT="${ENV_CONTENT:-}"
REMOTE_BACKUP_DIR="${REMOTE_BACKUP_DIR:-}"
REMOTE_WORKSPACE_BACKUP_DIR="${REMOTE_WORKSPACE_BACKUP_DIR:-}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
BACKUP_RETENTION_COUNT="${BACKUP_RETENTION_COUNT:-20}"
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
  cp prisma.config.ts .next/standalone/prisma.config.ts
  mkdir -p .next/standalone/scripts/check
  cp scripts/check/check-prisma-deploy-status.js .next/standalone/scripts/check/check-prisma-deploy-status.js

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
  test -f .next/standalone/prisma.config.ts
  test -f .next/standalone/scripts/check/check-prisma-deploy-status.js
  test -f .next/standalone/node_modules/prisma/build/index.js
  test -f .next/standalone/node_modules/effect/package.json
}

copy_resource_seed_files() {
  echo "==> 打包 RBAC resource manifest..."
  npx tsx scripts/write-resource-manifest.ts .next/standalone/resource-defs.json
  cp scripts/seed-resources-runtime.js .next/standalone/seed-resources-runtime.js
  test -f .next/standalone/resource-defs.json
  test -f .next/standalone/seed-resources-runtime.js
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

  # Next standalone tracing can leave native/runtime packages as partial shells.
  # Keep the SQLite adapter stack complete so production does not depend on
  # bundler internals for database access.
  copy_runtime_package_tree better-sqlite3 @prisma/adapter-better-sqlite3 @prisma/client dotenv
  copy_prisma_deploy_files
  copy_resource_seed_files

  rm -rf .next/standalone/generated/prisma
  mkdir -p .next/standalone/generated
  cp -R generated/prisma .next/standalone/generated/prisma
  find .next/standalone \( -name '.DS_Store' -o -name '._*' \) -delete

  test -f .next/standalone/node_modules/better-sqlite3/lib/index.js
  test -f .next/standalone/node_modules/@prisma/client/default.js
  test -f .next/standalone/generated/prisma/client.ts

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
    if [ ! -f '$REMOTE_WORKSPACE_CONFIG_DIR/data/dev.db' ] && [ -d '$REMOTE_DIR/data' ]; then
      rsync -a '$REMOTE_DIR/data/' '$REMOTE_WORKSPACE_CONFIG_DIR/data/'
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
    test -f '$REMOTE_WORKSPACE_CONFIG_DIR/.env'
    test -f '$REMOTE_WORKSPACE_CONFIG_DIR/config/pharma-qc/product_stage_tests.json'
    test -d '$REMOTE_WORKSPACE_CONFIG_DIR/config/pharma-qc/full'
    test -d '$REMOTE_WORKSPACE_CONFIG_DIR/config/pharma-qc/records'
    grep -q '^WORKSPACE_CONFIG_DIR=' '$REMOTE_WORKSPACE_CONFIG_DIR/.env'
    grep -q '^DATABASE_URL=' '$REMOTE_WORKSPACE_CONFIG_DIR/.env'
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

backup_remote_runtime() {
  echo "==> 备份服务器运行态配置和数据..."
  ssh_cmd "
    set -e
    mkdir -p '$REMOTE_BACKUP_DIR'
    if [ -d '$REMOTE_WORKSPACE_CONFIG_DIR' ]; then
      stamp=\$(date +%Y%m%d%H%M%S)
      backup='$REMOTE_BACKUP_DIR/workspace-runtime-'\$stamp'.tgz'
      parent=\$(dirname '$REMOTE_WORKSPACE_CONFIG_DIR')
      base=\$(basename '$REMOTE_WORKSPACE_CONFIG_DIR')
      tar -C \"\$parent\" -czf \"\$backup\" \"\$base\"
      ls -lh \"\$backup\"
    else
      echo '[警告] 运行态目录不存在，跳过备份: $REMOTE_WORKSPACE_CONFIG_DIR'
    fi
  "
}

cleanup_remote_backups() {
  echo "==> 清理服务器运行态备份（保留 ${BACKUP_RETENTION_DAYS} 天，最多 ${BACKUP_RETENTION_COUNT} 份）..."
  ssh_cmd "
    set -e
    mkdir -p '$REMOTE_BACKUP_DIR'
    python3 - <<'PY'
from pathlib import Path
import time

backup_dir = Path('$REMOTE_BACKUP_DIR')
retention_days = int('$BACKUP_RETENTION_DAYS')
retention_count = int('$BACKUP_RETENTION_COUNT')
now = time.time()
cutoff = now - retention_days * 86400
files = sorted(
    backup_dir.glob('workspace-runtime-*.tgz'),
    key=lambda path: path.stat().st_mtime,
    reverse=True,
)
for index, path in enumerate(files):
    too_many = index >= retention_count
    too_old = retention_days > 0 and path.stat().st_mtime < cutoff
    if too_many or too_old:
        path.unlink()
print(f'Runtime backups kept: {len(list(backup_dir.glob(\"workspace-runtime-*.tgz\")))}')
PY
  "
}

deploy_remote_artifact() {
  local release_id
  local remote_tar
  release_id="$(date +%Y%m%d%H%M%S)-$(git rev-parse --short HEAD 2>/dev/null || echo manual)"
  remote_tar="$REMOTE_WORKSPACE_CONFIG_DIR/deploy-workspace-standalone-$release_id.tgz"

  echo "==> 上传 CNB 构建产物到服务器..."
  rsync -avz -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=accept-new" \
    "$ARTIFACT_PATH" "$SERVER:$remote_tar"

  echo "==> 服务器解包产物并重启服务..."
  ssh_cmd "
    set -e
    mkdir -p '$REMOTE_DIR/releases'
    find '$REMOTE_DIR' -mindepth 1 -maxdepth 1 ! -name releases ! -name .workspace ! -name .workspace.backups -exec rm -rf {} +
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
    test -f \"\$release_dir/prisma/schema.prisma\"
    test -f \"\$release_dir/prisma/migrations/migration_lock.toml\"
    test -f \"\$release_dir/scripts/check/check-prisma-deploy-status.js\"
    test -f \"\$release_dir/node_modules/prisma/build/index.js\"
    test -f \"\$release_dir/resource-defs.json\"
    test -f \"\$release_dir/seed-resources-runtime.js\"

    cd \"\$release_dir\"
    set -a
    . \"\$release_dir/.env\"
    set +a
    export NODE_ENV=production
    echo '==> 检查 Prisma migration 状态...'
    node \"\$release_dir/scripts/check/check-prisma-deploy-status.js\" --migrations-dir \"\$release_dir/prisma/migrations\" --allow-pending
    echo '==> 执行 Prisma 数据库迁移...'
    node \"\$release_dir/node_modules/prisma/build/index.js\" migrate deploy --schema=\"\$release_dir/prisma\"
    node \"\$release_dir/scripts/check/check-prisma-deploy-status.js\" --migrations-dir \"\$release_dir/prisma/migrations\"
    echo '==> 同步 RBAC resource registry...'
    node \"\$release_dir/seed-resources-runtime.js\" \"\$release_dir/resource-defs.json\"

    pm2 delete '$PM2_NAME' 2>/dev/null || true
    pm2 start \"\$release_dir/\$server_entry\" --name '$PM2_NAME' --cwd \"\$app_dir\" --update-env
    qc_cache_ready=0
    for i in \$(seq 1 20); do
      if curl -fsS -X POST -H \"x-qc-cache-warmup: \$NEXTAUTH_SECRET\" 'http://127.0.0.1:3000/workspace/api/modules/production/qc/cache' >/dev/null; then
        qc_cache_ready=1
        break
      fi
      sleep 1
    done
    if [ \"\$qc_cache_ready\" != \"1\" ]; then
      echo '[错误] QC 模板缓存预热失败'
      pm2 logs '$PM2_NAME' --lines 80 --nostream || true
      exit 1
    fi
    pm2 save
    ln -sfn \"\$release_dir\" '$REMOTE_DIR/current'
    find '$REMOTE_DIR/releases' -mindepth 1 -maxdepth 1 -type d | sort -r | tail -n +6 | xargs -r rm -rf
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
npm run db:migration:check

build_artifact

echo "==> 验证服务器连接..."
ssh_cmd "echo CONNECTED && whoami && mkdir -p '$REMOTE_DIR'"

prepare_remote_runtime
validate_remote_runtime
backup_remote_runtime
cleanup_remote_backups
deploy_remote_artifact
run_healthcheck
notify_workspace_bot_deploy

echo ""
echo "==> CNB 产物部署完成"
