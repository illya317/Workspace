#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/../.."

require_env() {
  local key
  for key in "$@"; do
    if [ -z "${!key:-}" ]; then
      echo "[错误] runtime provision 缺少环境变量: $key" >&2
      exit 64
    fi
  done
}

require_env \
  SERVER \
  REMOTE_DIR \
  REMOTE_WORKSPACE_CONFIG_DIR \
  REMOTE_AGENT_SOURCE_DIR \
  REMOTE_AGENT_SOURCE_REPO_URL \
  RELEASE_SOURCE_SHA \
  RELEASE_SOURCE_TREE \
  DEPLOY_SSH_KEY \
  DEPLOY_SSH_CONTROL_PATH \
  DEPLOY_SSH_CONTROL_PERSIST_SECONDS

ENV_CONTENT_B64="${ENV_CONTENT_B64:-}"
LIBRARY_SYNC_SOURCE="${LIBRARY_SYNC_SOURCE:-}"
INSTALL_LIBRARY_RUNTIME_DEPS="${INSTALL_LIBRARY_RUNTIME_DEPS:-1}"
INSTALL_KIMI_AGENT_RUNTIME_DEPS="${INSTALL_KIMI_AGENT_RUNTIME_DEPS:-1}"

SSH_OPTIONS=(
  -i "$DEPLOY_SSH_KEY"
  -o BatchMode=yes
  -o ConnectTimeout=15
  -o ConnectionAttempts=1
  -o StrictHostKeyChecking=accept-new
  -o ControlMaster=auto
  -o "ControlPersist=${DEPLOY_SSH_CONTROL_PERSIST_SECONDS}"
  -o "ControlPath=$DEPLOY_SSH_CONTROL_PATH"
  -o ServerAliveInterval=30
  -o ServerAliveCountMax=3
)
RSYNC_SSH_COMMAND="ssh -i $DEPLOY_SSH_KEY -o BatchMode=yes -o ConnectTimeout=15 -o ConnectionAttempts=1 -o StrictHostKeyChecking=accept-new -o ControlMaster=auto -o ControlPersist=$DEPLOY_SSH_CONTROL_PERSIST_SECONDS -o ControlPath=$DEPLOY_SSH_CONTROL_PATH -o ServerAliveInterval=30 -o ServerAliveCountMax=3"

ssh_cmd() {
  ssh "${SSH_OPTIONS[@]}" "$SERVER" "$@"
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
    echo "==> 跳过服务器 OCR/PDF 依赖安装（INSTALL_LIBRARY_RUNTIME_DEPS=${INSTALL_LIBRARY_RUNTIME_DEPS}）"
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
    echo "==> 跳过 Kimi Agent SDK 运行时安装（INSTALL_KIMI_AGENT_RUNTIME_DEPS=${INSTALL_KIMI_AGENT_RUNTIME_DEPS}）"
    return
  fi

  local remote_tool_dir="$REMOTE_WORKSPACE_CONFIG_DIR/runtime/kimi-agent-bootstrap"
  echo "==> 同步并校验 Kimi Agent SDK 隔离运行时..."
  ssh_cmd "mkdir -p '$remote_tool_dir'"
  rsync -az -e "$RSYNC_SSH_COMMAND" \
    ops/install-kimi-agent-runtime.sh \
    ops/kimi-agent-sandbox-runner.sh \
    "$SERVER:$remote_tool_dir/"
  ssh_cmd "
    set -e
    chmod +x '$remote_tool_dir/install-kimi-agent-runtime.sh' '$remote_tool_dir/kimi-agent-sandbox-runner.sh'
    runtime_digest=\$(sha256sum \
      '$remote_tool_dir/install-kimi-agent-runtime.sh' \
      '$remote_tool_dir/kimi-agent-sandbox-runner.sh' | sha256sum | awk '{print \$1}')
    runtime_marker='$remote_tool_dir/.installed-source.sha256'
    if [ -f \"\$runtime_marker\" ] \
      && [ \"\$(cat \"\$runtime_marker\")\" = \"\$runtime_digest\" ] \
      && WORKSPACE_CONFIG_DIR='$REMOTE_WORKSPACE_CONFIG_DIR' '$remote_tool_dir/install-kimi-agent-runtime.sh' --check; then
      echo '==> Kimi Agent 隔离运行时 source/version 未变化，跳过网络安装'
    else
      WORKSPACE_CONFIG_DIR='$REMOTE_WORKSPACE_CONFIG_DIR' '$remote_tool_dir/install-kimi-agent-runtime.sh'
      WORKSPACE_CONFIG_DIR='$REMOTE_WORKSPACE_CONFIG_DIR' '$remote_tool_dir/install-kimi-agent-runtime.sh' --check
      printf '%s\\n' \"\$runtime_digest\" > \"\$runtime_marker.tmp\"
      chmod 600 \"\$runtime_marker.tmp\"
      mv \"\$runtime_marker.tmp\" \"\$runtime_marker\"
    fi
  "
}

sync_remote_agent_source() {
  echo "==> 同步服务器页面助手源码到 canonical SHA: ${RELEASE_SOURCE_SHA:0:12} -> $REMOTE_AGENT_SOURCE_DIR"
  ssh_cmd "
    set -e
    if ! command -v git >/dev/null 2>&1; then
      echo '[错误] 服务器缺少 git，无法同步页面助手源码'
      exit 1
    fi
    mkdir -p \"\$(dirname '$REMOTE_AGENT_SOURCE_DIR')\"
    if [ -d '$REMOTE_AGENT_SOURCE_DIR/.git' ]; then
      git -C '$REMOTE_AGENT_SOURCE_DIR' remote set-url origin '$REMOTE_AGENT_SOURCE_REPO_URL'
    else
      rm -rf '$REMOTE_AGENT_SOURCE_DIR'
      mkdir -p '$REMOTE_AGENT_SOURCE_DIR'
      git -C '$REMOTE_AGENT_SOURCE_DIR' init
      git -C '$REMOTE_AGENT_SOURCE_DIR' remote add origin '$REMOTE_AGENT_SOURCE_REPO_URL'
    fi
    git -C '$REMOTE_AGENT_SOURCE_DIR' fetch --no-tags --depth=1 origin '$RELEASE_SOURCE_SHA'
    if [ \"\$(git -C '$REMOTE_AGENT_SOURCE_DIR' rev-parse FETCH_HEAD)\" != '$RELEASE_SOURCE_SHA' ]; then
      echo '[错误] 页面助手源码 fetch 未得到 canonical source SHA'
      exit 1
    fi
    git -C '$REMOTE_AGENT_SOURCE_DIR' reset --hard '$RELEASE_SOURCE_SHA'
    git -C '$REMOTE_AGENT_SOURCE_DIR' clean -ffdx
    if [ \"\$(git -C '$REMOTE_AGENT_SOURCE_DIR' rev-parse HEAD)\" != '$RELEASE_SOURCE_SHA' ] \
      || [ \"\$(git -C '$REMOTE_AGENT_SOURCE_DIR' rev-parse 'HEAD^{tree}')\" != '$RELEASE_SOURCE_TREE' ] \
      || [ -n \"\$(git -C '$REMOTE_AGENT_SOURCE_DIR' status --porcelain)\" ]; then
      echo '[错误] 页面助手源码未锁定到 canonical source identity'
      exit 1
    fi
    git -C '$REMOTE_AGENT_SOURCE_DIR' rev-parse HEAD
  "
}

validate_remote_runtime() {
  echo "==> 校验服务器运行态配置..."
  # The quoted payload is parsed by the remote shell; these escaped variables are not local word concatenation.
  # shellcheck disable=SC2140
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


prepare_remote_runtime
ensure_remote_library_runtime_deps
ensure_remote_kimi_agent_runtime
sync_remote_library_source
sync_remote_agent_source
validate_remote_runtime
