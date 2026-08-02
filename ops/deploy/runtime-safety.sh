validate_remote_runtime() {
  echo "==> 校验服务器运行态配置..."
  ssh_cmd "
    diagnostic_status=0
    record_runtime_failure() {
      echo \"[错误] \$1\" >&2
      diagnostic_status=1
    }
    if [ '$WORKSPACE_RUNTIME_PM2_MODE' = 'hardened' ]; then
      sudo -n -- test -r '$REMOTE_CONTROL_ENV_FILE' || record_runtime_failure 'control env 不可读'
      sudo -n -- test -r '$REMOTE_RUNTIME_ENV_FILE' || record_runtime_failure 'runtime env 不可读'
    else
      test -r '$REMOTE_CONTROL_ENV_FILE' || record_runtime_failure 'legacy env 不可读'
    fi
    test -f '$REMOTE_WORKSPACE_CONFIG_DIR/config/pharma-qc/product_stage_tests.json' || record_runtime_failure 'product_stage_tests.json 缺失'
    test -d '$REMOTE_WORKSPACE_CONFIG_DIR/config/pharma-qc/full' || record_runtime_failure 'pharma-qc/full 目录缺失'
    test -d '$REMOTE_WORKSPACE_CONFIG_DIR/config/pharma-qc/records' || record_runtime_failure 'pharma-qc/records 目录缺失'
    load_control_environment || record_runtime_failure 'control/runtime environment 加载失败'
    test -n \"\${WORKSPACE_CONFIG_DIR:-}\" || record_runtime_failure 'WORKSPACE_CONFIG_DIR 缺失'
    test -n \"\${DATABASE_URL:-}\" || record_runtime_failure 'DATABASE_URL 缺失'
    test -n \"\${DIRECT_URL:-}\" || record_runtime_failure 'DIRECT_URL 缺失'
    test -n \"\${LIBRARY_SOURCE_ROOT:-}\" || record_runtime_failure 'LIBRARY_SOURCE_ROOT 缺失'
    test -n \"\${LIBRARY_ROOT:-}\" || record_runtime_failure 'LIBRARY_ROOT 缺失'
    if [ '$INSTALL_ONLYOFFICE_RUNTIME' = '1' ]; then
      test -n \"\${ONLYOFFICE_JWT_SECRET:-}\" || record_runtime_failure 'ONLYOFFICE_JWT_SECRET 缺失'
      printf '%s' \"\${WORKSPACE_PUBLIC_ORIGIN:-}\" | grep -Eq '^https?://[^[:space:]]+' || record_runtime_failure 'WORKSPACE_PUBLIC_ORIGIN 格式无效'
    fi
    WORKSPACE_CONFIG_DIR='$REMOTE_WORKSPACE_CONFIG_DIR' '$REMOTE_WORKSPACE_CONFIG_DIR/runtime/kimi-agent-bootstrap/install-kimi-agent-runtime.sh' --check || record_runtime_failure 'Kimi Agent runtime check 失败'
    if [ '$INSTALL_ONLYOFFICE_RUNTIME' = '1' ]; then
      WORKSPACE_CONFIG_DIR='$REMOTE_WORKSPACE_CONFIG_DIR' WORKSPACE_PUBLIC_ORIGIN_HINT='$WORKSPACE_PUBLIC_ORIGIN_HINT' '$REMOTE_WORKSPACE_CONFIG_DIR/runtime/onlyoffice-bootstrap/install-onlyoffice-runtime.sh' --check || record_runtime_failure 'OnlyOffice runtime check 失败'
    fi
    if ! python3 - <<'PY'
from pathlib import Path
import os
import sys

env = dict(os.environ)
errors = []
obsolete_agent_keys = {
    'AGENT_MODEL_PROVIDER', 'KIMI_API_KEY', 'KIMI_BASE_URL', 'KIMI_MODEL', 'KIMI_MAX_TOKENS',
    'DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL', 'DEEPSEEK_MODEL', 'AGENT_SOURCE_WORKTREE',
    'AGENT_SOURCE_CACHE_DIR', 'AGENT_SOURCE_REPO_URL', 'AGENT_SOURCE_BRANCH', 'CNB_PR_TOKEN',
    'CNB_PR_REPO', 'CNB_PR_BRANCH_PREFIX', 'CNB_PR_GIT_AUTHOR_NAME', 'CNB_PR_GIT_AUTHOR_EMAIL',
}
present_obsolete = sorted(key for key in obsolete_agent_keys if key in env)
if present_obsolete:
    errors.append('server environment still contains retired Agent provider/source/PR configuration: ' + ', '.join(present_obsolete))

workspace = env.get('WORKSPACE_CONFIG_DIR', '')
database = env.get('DATABASE_URL', '')
direct_database = env.get('DIRECT_URL', '')
library_source_root = env.get('LIBRARY_SOURCE_ROOT', '')
library_root = env.get('LIBRARY_ROOT', '')
cutover_source = env.get('SQLITE_CUTOVER_SOURCE', '')
rollback_env_value = env.get('SQLITE_CUTOVER_ROLLBACK_ENV', '')
if not workspace:
    errors.append('WORKSPACE_CONFIG_DIR missing from remote .env')
elif not os.path.isabs(workspace):
    errors.append(f'WORKSPACE_CONFIG_DIR must be absolute: {workspace}')
from urllib.parse import unquote, urlparse
database_url = urlparse(database)
direct_url = urlparse(direct_database)
if database_url.scheme not in {'postgres', 'postgresql'}:
    errors.append('DATABASE_URL must use PostgreSQL')
if direct_url.scheme not in {'postgres', 'postgresql'}:
    errors.append('DIRECT_URL must use PostgreSQL')
if not database_url.hostname or not database_url.path or database_url.path == '/':
    errors.append('DATABASE_URL must include host and database name')
if not direct_url.hostname or not direct_url.path or direct_url.path == '/':
    errors.append('DIRECT_URL must include host and database name')
database_endpoint = (database_url.hostname, database_url.port or 5432, database_url.path)
direct_endpoint = (direct_url.hostname, direct_url.port or 5432, direct_url.path)
if database_endpoint != direct_endpoint:
    errors.append('DATABASE_URL and DIRECT_URL must select the same PostgreSQL host, port, and database')
if cutover_source:
    if '$WORKSPACE_RUNTIME_PM2_MODE' == 'hardened':
        errors.append('SQLite cutover is incompatible with hardened runtime/control-plane credential isolation')
    active_env_path = Path('$REMOTE_CONTROL_ENV_FILE').resolve()
    rollback_env_path = Path(rollback_env_value)
    if not rollback_env_path.is_absolute():
        errors.append('SQLITE_CUTOVER_ROLLBACK_ENV must be absolute')
    if not rollback_env_path.is_file():
        errors.append(f'SQLITE_CUTOVER_ROLLBACK_ENV is not a readable file: {rollback_env_path}')
    elif rollback_env_path.resolve() == active_env_path:
        errors.append('SQLITE_CUTOVER_ROLLBACK_ENV must not point at the active PostgreSQL .env')
    rollback_env = {}
    if rollback_env_path.is_file():
        for line in rollback_env_path.read_text().splitlines():
            if not line or line.lstrip().startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            rollback_env[key] = value.strip().strip('\"').strip(\"'\")
    for required_key in ('DATABASE_URL', 'NEXTAUTH_SECRET', 'WORKSPACE_CONFIG_DIR'):
        if not rollback_env.get(required_key):
            errors.append(f'{required_key} missing from SQLITE_CUTOVER_ROLLBACK_ENV')
    rollback_database_url = urlparse(rollback_env.get('DATABASE_URL', ''))
    rollback_database_path = Path(unquote(rollback_database_url.path))
    if rollback_database_url.scheme != 'file' or not rollback_database_path.is_absolute():
        errors.append('rollback DATABASE_URL must be file:<absolute-sqlite-path>')
    elif not rollback_database_path.is_file():
        errors.append(f'rollback SQLite database does not exist: {rollback_database_path}')
    if rollback_env.get('WORKSPACE_CONFIG_DIR') and rollback_env['WORKSPACE_CONFIG_DIR'] != workspace:
        errors.append('rollback WORKSPACE_CONFIG_DIR must match the active runtime directory')
if not os.path.isabs(library_root):
    errors.append(f'LIBRARY_ROOT must be absolute: {library_root}')
if not library_root.startswith(os.path.join(workspace, 'library') + os.sep) and library_root != os.path.join(workspace, 'library'):
    errors.append(f'LIBRARY_ROOT must live under WORKSPACE_CONFIG_DIR/library: {library_root}')
if not os.path.isabs(library_source_root):
    errors.append(f'LIBRARY_SOURCE_ROOT must be absolute: {library_source_root}')
expected_library_source = os.path.join(workspace, 'library', 'originals')
if library_source_root != expected_library_source:
    errors.append(f'LIBRARY_SOURCE_ROOT must equal WORKSPACE_CONFIG_DIR/library/originals: {library_source_root}')
if errors:
    print(f'Remote runtime env failures ({len(errors)}):', file=sys.stderr)
    for error in errors:
        print(f' - {error}', file=sys.stderr)
    raise SystemExit(1)
print('Remote runtime env check passed.')
PY
    then
      diagnostic_status=1
    fi
    if [ -n \"\${SQLITE_CUTOVER_SOURCE:-}\" ]; then
      case \"\${SQLITE_CUTOVER_ROLLBACK_ENV:-}\" in /*) ;; *) record_runtime_failure 'SQLITE_CUTOVER_ROLLBACK_ENV 必须是绝对路径' ;; esac
      test -r \"\${SQLITE_CUTOVER_ROLLBACK_ENV:-/nonexistent}\" || record_runtime_failure 'SQLITE_CUTOVER_ROLLBACK_ENV 不可读'
    fi
    for required_command in psql pg_dump pg_restore pg_isready; do
      command -v "\$required_command" >/dev/null || record_runtime_failure "缺少数据库命令: \$required_command"
    done
    pg_isready --dbname="\${DIRECT_URL:-}" >/dev/null || record_runtime_failure 'DIRECT_URL pg_isready 失败'
    psql "\${DIRECT_URL:-}" -v ON_ERROR_STOP=1 -Atc 'SELECT 1' >/dev/null || record_runtime_failure 'DIRECT_URL SELECT 1 失败'
    psql "\${DATABASE_URL:-}" -v ON_ERROR_STOP=1 -Atc 'SELECT 1' >/dev/null || record_runtime_failure 'DATABASE_URL SELECT 1 失败'
    direct_identity=''
    runtime_identity=''
    direct_identity=\$(psql "\${DIRECT_URL:-}" -v ON_ERROR_STOP=1 -Atc \"SELECT current_database() || '|' || COALESCE(inet_server_addr()::text, 'local') || '|' || inet_server_port()::text\") || record_runtime_failure 'DIRECT_URL identity 查询失败'
    runtime_identity=\$(psql "\${DATABASE_URL:-}" -v ON_ERROR_STOP=1 -Atc \"SELECT current_database() || '|' || COALESCE(inet_server_addr()::text, 'local') || '|' || inet_server_port()::text\") || record_runtime_failure 'DATABASE_URL identity 查询失败'
    if [ -n "\$direct_identity" ] && [ -n "\$runtime_identity" ] && [ "\$direct_identity" != "\$runtime_identity" ]; then
      record_runtime_failure 'DATABASE_URL 与 DIRECT_URL 连接到不同的 PostgreSQL 实例'
    fi
    exit "\$diagnostic_status"
  "
}

backup_remote_postgresql() {
  echo "==> 创建并验证 PostgreSQL 逻辑备份..."
  ssh_cmd "
    set -e
    umask 077
    mkdir -p '$REMOTE_BACKUP_DIR'
    load_control_environment
    stamp=\$(date +%Y%m%d%H%M%S)
    backup='$REMOTE_BACKUP_DIR/workspace-postgresql-'\$stamp'.dump'
    backup_database_url=\"\${WORKSPACE_BACKUP_DATABASE_URL:-\$DIRECT_URL}\"
    pg_dump --format=custom --no-owner --no-privileges --file=\"\$backup\" \"\$backup_database_url\"
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
    workspace_privileged mkdir -p '$REMOTE_RUNTIME_SNAPSHOT_DIR'
    if [ -d '$REMOTE_WORKSPACE_CONFIG_DIR' ]; then
      stamp=\$(date +%Y%m%d%H%M%S)
      snapshot='$REMOTE_RUNTIME_SNAPSHOT_DIR/'\$stamp
      snapshot_tmp='$REMOTE_RUNTIME_SNAPSHOT_DIR/.'\$stamp'.tmp'
      previous=\$(workspace_privileged find '$REMOTE_RUNTIME_SNAPSHOT_DIR' -mindepth 1 -maxdepth 1 -type d -name '20*' -printf '%f\\n' | sort | tail -n 1)
      workspace_privileged rm -rf \"\$snapshot_tmp\"
      workspace_privileged mkdir -p \"\$snapshot_tmp\"
      trap 'workspace_privileged rm -rf \"\$snapshot_tmp\"' EXIT
      if [ -n \"\$previous\" ]; then
        workspace_privileged rsync -a --delete --link-dest=\"$REMOTE_RUNTIME_SNAPSHOT_DIR/\$previous\" '$REMOTE_WORKSPACE_CONFIG_DIR/' \"\$snapshot_tmp/\"
      else
        workspace_privileged rsync -a --delete '$REMOTE_WORKSPACE_CONFIG_DIR/' \"\$snapshot_tmp/\"
      fi
      workspace_privileged mv \"\$snapshot_tmp\" \"\$snapshot\"
      trap - EXIT
      workspace_privileged du -sh \"\$snapshot\"
    else
      echo '[警告] 运行态目录不存在，跳过备份: $REMOTE_WORKSPACE_CONFIG_DIR'
    fi
  "
}

cleanup_remote_backups() {
  echo "==> 清理服务器备份（每类保留 ${BACKUP_RETENTION_DAYS} 天，最多 ${BACKUP_RETENTION_COUNT} 份）..."
  ssh_cmd "
    set -e
    workspace_privileged mkdir -p '$REMOTE_BACKUP_DIR'
    if [ ! -f '$REMOTE_WORKSPACE_CONFIG_DIR/maintenance-deploy' ]; then
      workspace_privileged rm -rf '$REMOTE_BACKUP_DIR/maintenance-pinned'
    fi
    workspace_privileged python3 - <<'PY'
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
