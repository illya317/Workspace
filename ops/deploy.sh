#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

SERVER="${SERVER:-}"
REMOTE_DIR="${REMOTE_DIR:-}"
PM2_NAME="${PM2_NAME:-workspace}"
PM2_WECOM_BOT_NAME="${PM2_WECOM_BOT_NAME:-${PM2_NAME}-wecom-agent}"
REMOTE_WORKSPACE_CONFIG_DIR="${REMOTE_WORKSPACE_CONFIG_DIR:-}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-}"
RUN_LOCAL_CHECKS="${RUN_LOCAL_CHECKS:-0}"
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
CNB_DEPLOY_REQUEST_FILE="${CNB_DEPLOY_REQUEST_FILE:-.cnb-deploy-request.json}"
RELEASE_SOURCE_BRANCH="${RELEASE_SOURCE_BRANCH:-main}"
EXPECTED_CNB_REPOSITORY="${EXPECTED_CNB_REPOSITORY:-illya317/Workspace}"
CNB_RELEASE_SHA="${CNB_RELEASE_SHA:-}"
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
REMOTE_DEPLOY_LOCK_PID=""
REMOTE_DEPLOY_LOCK_TOKEN=""
REMOTE_DEPLOY_LOCK_HELD=0
DEPLOYED_SOURCE_SHA=""
DEPLOYED_ARTIFACT_DIGEST=""

release_remote_deploy_lock() {
  if [ "$REMOTE_DEPLOY_LOCK_HELD" != "1" ]; then
    return
  fi
  ssh "${SSH_OPTIONS[@]}" "$SERVER" \
    "touch '$REMOTE_WORKSPACE_CONFIG_DIR/deploy-lock.release-$REMOTE_DEPLOY_LOCK_TOKEN'" >/dev/null 2>&1 || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if ! kill -0 "$REMOTE_DEPLOY_LOCK_PID" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  if kill -0 "$REMOTE_DEPLOY_LOCK_PID" >/dev/null 2>&1; then
    kill "$REMOTE_DEPLOY_LOCK_PID" >/dev/null 2>&1 || true
  fi
  wait "$REMOTE_DEPLOY_LOCK_PID" >/dev/null 2>&1 || true
  REMOTE_DEPLOY_LOCK_HELD=0
}

cleanup_deploy() {
  release_remote_deploy_lock
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

acquire_remote_deploy_lock() {
  local lock_owner_file
  local lock_release_file
  local wait_status

  REMOTE_DEPLOY_LOCK_TOKEN="${RELEASE_SOURCE_SHA}-$$-$(date +%s)"
  lock_owner_file="$REMOTE_WORKSPACE_CONFIG_DIR/deploy-lock.owner"
  lock_release_file="$REMOTE_WORKSPACE_CONFIG_DIR/deploy-lock.release-$REMOTE_DEPLOY_LOCK_TOKEN"
  echo "==> 获取生产部署互斥锁..."
  ssh "${SSH_OPTIONS[@]}" "$SERVER" "
    set -e
    mkdir -p '$REMOTE_WORKSPACE_CONFIG_DIR'
    command -v flock >/dev/null
    rm -f '$lock_release_file'
    exec 9>'$REMOTE_WORKSPACE_CONFIG_DIR/deploy.lock'
    if ! flock -n 9; then
      echo '[错误] 另一生产部署正在 backup→switch 临界区运行'
      exit 73
    fi
    printf '%s\n' '$REMOTE_DEPLOY_LOCK_TOKEN' > '$lock_owner_file'
    trap \"rm -f '$lock_owner_file' '$lock_release_file'\" EXIT
    while [ ! -f '$lock_release_file' ]; do sleep 1; done
  " &
  REMOTE_DEPLOY_LOCK_PID=$!

  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    if ssh_cmd "test \"\$(cat '$lock_owner_file' 2>/dev/null)\" = '$REMOTE_DEPLOY_LOCK_TOKEN'" >/dev/null 2>&1; then
      REMOTE_DEPLOY_LOCK_HELD=1
      echo "==> 已获取生产部署互斥锁。"
      return
    fi
    if ! kill -0 "$REMOTE_DEPLOY_LOCK_PID" >/dev/null 2>&1; then
      wait_status=0
      wait "$REMOTE_DEPLOY_LOCK_PID" || wait_status=$?
      echo "[错误] 无法获取生产部署互斥锁（remote status: ${wait_status}）"
      exit 1
    fi
    sleep 1
  done

  kill "$REMOTE_DEPLOY_LOCK_PID" >/dev/null 2>&1 || true
  wait "$REMOTE_DEPLOY_LOCK_PID" >/dev/null 2>&1 || true
  echo "[错误] 获取生产部署互斥锁超时"
  exit 1
}

reconcile_completed_deploy_markers() {
  echo "==> 锁内清理遗留 candidate，并对账正式部署记录与 maintenance/bootstrap marker..."
  ssh_cmd "
    set -e
    deployed_record='$REMOTE_WORKSPACE_CONFIG_DIR/deployed-release.json'
    maintenance_marker='$REMOTE_WORKSPACE_CONFIG_DIR/maintenance-deploy'
    bootstrap_marker='$REMOTE_WORKSPACE_CONFIG_DIR/production-bootstrap-in-progress.json'
    fence_all_writers() {
      pm2 delete '$PM2_NAME-candidate' 2>/dev/null || true
      pm2 delete '$PM2_NAME' 2>/dev/null || true
      pm2 delete '$PM2_WECOM_BOT_NAME' 2>/dev/null || true
      managed_processes=\$(pm2 jlist)
      MANAGED_PROCESSES=\"\$managed_processes\" MANAGED_NAMES='$PM2_NAME-candidate,$PM2_NAME,$PM2_WECOM_BOT_NAME' python3 - <<'PY'
import json
import os

processes = json.loads(os.environ['MANAGED_PROCESSES'])
if not isinstance(processes, list) or any(not isinstance(item, dict) for item in processes):
    raise SystemExit('PM2 writer fencing did not return a process object list')
names = set(os.environ['MANAGED_NAMES'].split(','))
for item in processes:
    if item.get('name') not in names:
        continue
    environment = item.get('pm2_env') or {}
    pid = item.get('pid') or 0
    if environment.get('status') != 'stopped' or pid != 0:
        raise SystemExit(f\"managed writer {item.get('name')} is still active after fencing\")
PY
      pm2 save
    }
    # A candidate from an interrupted or older deploy must never survive into
    # backup, migration, seed, or provisioning for the next attempt.
    pm2 delete '$PM2_NAME-candidate' 2>/dev/null || true
    candidate_processes=\$(pm2 jlist)
    PROCESS_LIST=\"\$candidate_processes\" PROCESS_NAME='$PM2_NAME-candidate' python3 - <<'PY'
import json
import os

processes = json.loads(os.environ['PROCESS_LIST'])
if not isinstance(processes, list) or any(not isinstance(item, dict) for item in processes):
    raise SystemExit('candidate cleanup did not return a process object list')
matches = [item for item in processes if item.get('name') == os.environ['PROCESS_NAME']]
for item in matches:
    environment = item.get('pm2_env') or {}
    pid = item.get('pid') or 0
    if environment.get('status') != 'stopped' or pid != 0:
        raise SystemExit('candidate writer is still active before release verification')
PY
    pm2 save
    if [ ! -e \"\$maintenance_marker\" ] && [ ! -e \"\$bootstrap_marker\" ]; then
      exit 0
    fi
    if [ ! -f \"\$deployed_record\" ]; then
      echo '==> 正式部署记录尚未创建；先隔离所有 writer，再验证同一 candidate 的续跑 marker'
      fence_all_writers
    fi
    marker_values=\$(DEPLOYED_RECORD=\"\$deployed_record\" MAINTENANCE_MARKER=\"\$maintenance_marker\" BOOTSTRAP_MARKER=\"\$bootstrap_marker\" REMOTE_DIR='$REMOTE_DIR' EXPECTED_CANDIDATE='$RELEASE_SOURCE_SHA' python3 - <<'PY'
import json
import os
import re
from pathlib import Path

try:
    marker_sources = []
    maintenance = Path(os.environ['MAINTENANCE_MARKER'])
    if maintenance.exists():
        if not maintenance.is_file():
            raise ValueError('maintenance marker is not a regular file')
        lines = maintenance.read_text(encoding='utf-8').splitlines()
        values = [line.removeprefix('sourceSha=') for line in lines if line.startswith('sourceSha=')]
        if len(lines) != 4 or len(values) != 1 or not re.fullmatch(r'[0-9a-f]{40}', values[0]):
            raise ValueError('maintenance marker source is invalid')
        marker_sources.append(values[0])
    bootstrap = Path(os.environ['BOOTSTRAP_MARKER'])
    if bootstrap.exists():
        if not bootstrap.is_file():
            raise ValueError('bootstrap progress marker is not a regular file')
        candidate = json.loads(bootstrap.read_text(encoding='utf-8')).get('candidateSha')
        if not isinstance(candidate, str) or not re.fullmatch(r'[0-9a-f]{40}', candidate):
            raise ValueError('bootstrap progress marker source is invalid')
        marker_sources.append(candidate)
    if not marker_sources:
        raise ValueError('marker reconciliation found no candidate source')

    deployed_path = Path(os.environ['DEPLOYED_RECORD'])
    if not deployed_path.exists():
        if all(value == os.environ['EXPECTED_CANDIDATE'] for value in marker_sources):
            print('RESUME')
        else:
            print('CONFLICT')
        raise SystemExit(0)

    record = json.loads(deployed_path.read_text(encoding='utf-8'))
    source = record.get('source', {}).get('commitSha')
    release_dir = record.get('deployment', {}).get('releaseDir')
    if not isinstance(source, str) or not re.fullmatch(r'[0-9a-f]{40}', source):
        raise ValueError('formal deployed-release source is invalid')
    release_root = (Path(os.environ['REMOTE_DIR']) / 'releases').resolve(strict=True)
    target = Path(release_dir).resolve(strict=True)
    target.relative_to(release_root)
    if all(value == source for value in marker_sources):
        print('CLEAN')
        print(source)
        print(target)
    elif all(value == os.environ['EXPECTED_CANDIDATE'] for value in marker_sources):
        print('RESUME')
    else:
        print('CONFLICT')
except Exception as error:
    print('INVALID')
    print(str(error))
PY
    )
    marker_action=\$(printf '%s\n' \"\$marker_values\" | sed -n '1p')
    if [ \"\$marker_action\" = 'RESUME' ]; then
      fence_all_writers
      echo '==> marker 属于当前 candidate 的未完成尝试；writer 已隔离，保留并进入锁内 resume'
      exit 0
    fi
    if [ \"\$marker_action\" = 'CONFLICT' ] || [ \"\$marker_action\" = 'INVALID' ]; then
      fence_all_writers
      echo '[错误] marker 与正式记录/当前 candidate 冲突或损坏；writer 已保持隔离'
      printf '%s\n' \"\$marker_values\" | sed -n '2p' >&2
      exit 1
    fi
    if [ \"\$marker_action\" != 'CLEAN' ]; then
      fence_all_writers
      echo '[错误] marker reconciliation action 无效'
      exit 1
    fi
    if ! (
      set -e
      record_source=\$(printf '%s\n' \"\$marker_values\" | sed -n '2p')
      record_target=\$(printf '%s\n' \"\$marker_values\" | sed -n '3p')
      current_target=\$(readlink -f '$REMOTE_DIR/current') || exit 1
      if [ \"\$current_target\" != \"\$record_target\" ]; then
        echo '[错误] marker 对账时 current 未指向正式 deployed-release'
        exit 1
      fi
      process_list=\$(pm2 jlist) || exit 1
      PROCESS_LIST=\"\$process_list\" PROCESS_NAME='$PM2_NAME' EXPECTED_TARGET=\"\$record_target\" node - <<'NODE' || exit 1
const fs = require('fs');
const path = require('path');
const processes = JSON.parse(process.env.PROCESS_LIST || 'null');
const matches = Array.isArray(processes)
  ? processes.filter((item) => item?.name === process.env.PROCESS_NAME)
  : [];
if (matches.length !== 1 || matches[0]?.pm2_env?.status !== 'online'
  || !Number.isInteger(matches[0]?.pid) || matches[0].pid < 1) {
  throw new Error('marker reconciliation requires one online Workspace process');
}
const target = fs.realpathSync(process.env.EXPECTED_TARGET);
for (const value of [matches[0]?.pm2_env?.pm_cwd, matches[0]?.pm2_env?.pm_exec_path]) {
  if (typeof value !== 'string') throw new Error('marker reconciliation PM2 identity is incomplete');
  const actual = fs.realpathSync(value);
  if (actual !== target && !actual.startsWith(target + path.sep)) {
    throw new Error('marker reconciliation PM2 identity is outside the deployed release');
  }
}
NODE
      curl -fsS '$HEALTHCHECK_URL' >/dev/null || exit 1
      version_response=\$(curl -fsS 'http://127.0.0.1:3000/workspace/api/settings/version') || exit 1
      VERSION_RESPONSE=\"\$version_response\" EXPECTED_VERSION=\"\$record_source\" node - <<'NODE' || exit 1
const payload = JSON.parse(process.env.VERSION_RESPONSE || 'null');
if (!payload || payload.version !== process.env.EXPECTED_VERSION) {
  throw new Error('marker reconciliation runtime version does not match deployed-release');
}
NODE
    ); then
      fence_all_writers
      echo '[错误] CLEAN marker 无法证明 current/PM2/health/version 与正式记录一致；writer 已隔离'
      exit 1
    fi
    rm -f \"\$maintenance_marker\" \"\$bootstrap_marker\"
    echo '==> 正式 release 已在线；遗留 marker 已幂等清理'
  "
}

verify_bootstrap_production_state() {
  [ -n "$RELEASE_BOOTSTRAP_BASE" ] || return 0
  echo "==> 锁内复验旧生产接管凭证（current / PM2 / runtime / BUILD_ID / migrations）..."
  # The quoted payload is parsed by the remote shell; escaped SQL quoting is not local word concatenation.
  # shellcheck disable=SC2140
  ssh_cmd "
    set -e
    test ! -e '$REMOTE_WORKSPACE_CONFIG_DIR/deployed-release.json'
    bootstrap_progress_marker='$REMOTE_WORKSPACE_CONFIG_DIR/production-bootstrap-in-progress.json'
    bootstrap_progress=0
    if [ -e \"\$bootstrap_progress_marker\" ]; then
      bootstrap_marker_status=\$(BOOTSTRAP_PROGRESS_MARKER=\"\$bootstrap_progress_marker\" \
      EXPECTED_BASELINE='$RELEASE_BOOTSTRAP_BASE' \
      EXPECTED_CANDIDATE='$RELEASE_SOURCE_SHA' \
      EXPECTED_TREE='$RELEASE_SOURCE_TREE' \
      EXPECTED_MIGRATION_SET='$RELEASE_MIGRATION_SET_SHA' \
      EXPECTED_LEGACY_RELEASE='$RELEASE_BOOTSTRAP_LEGACY_RELEASE_ID' \
      EXPECTED_LEGACY_CNB_COMMIT='$RELEASE_BOOTSTRAP_LEGACY_CNB_COMMIT' \
      EXPECTED_LEGACY_CNB_BUILD_SN='$RELEASE_BOOTSTRAP_LEGACY_CNB_BUILD_SN' \
      EXPECTED_LEGACY_RUNTIME_VERSION='$RELEASE_BOOTSTRAP_LEGACY_RUNTIME_VERSION' \
      EXPECTED_LEGACY_BUILD_ID='$RELEASE_BOOTSTRAP_LEGACY_BUILD_ID' \
      EXPECTED_LEGACY_CNB_REPOSITORY='$RELEASE_BOOTSTRAP_CNB_REPOSITORY' \
      EXPECTED_BASELINE_COUNT='$RELEASE_BOOTSTRAP_MIGRATION_COUNT' \
      EXPECTED_BASELINE_DIGEST='$RELEASE_BOOTSTRAP_MIGRATION_DIGEST' python3 - <<'PY'
import json
import os
from pathlib import Path

expected = {
    'schemaVersion': 2,
    'phase': 'mutation-started',
    'baselineSha': os.environ['EXPECTED_BASELINE'],
    'candidateSha': os.environ['EXPECTED_CANDIDATE'],
    'candidateTreeSha': os.environ['EXPECTED_TREE'],
    'candidateMigrationSetSha256': os.environ['EXPECTED_MIGRATION_SET'],
    'legacyReleaseId': os.environ['EXPECTED_LEGACY_RELEASE'],
    'legacyCnbCommitSha': os.environ['EXPECTED_LEGACY_CNB_COMMIT'],
    'legacyCnbBuildSn': os.environ['EXPECTED_LEGACY_CNB_BUILD_SN'],
    'legacyRuntimeVersion': os.environ['EXPECTED_LEGACY_RUNTIME_VERSION'],
    'legacyBuildId': os.environ['EXPECTED_LEGACY_BUILD_ID'],
    'legacyCnbRepository': os.environ['EXPECTED_LEGACY_CNB_REPOSITORY'],
    'baselineMigrationCount': int(os.environ['EXPECTED_BASELINE_COUNT']),
    'baselineMigrationSetSha256': os.environ['EXPECTED_BASELINE_DIGEST'],
}
path = Path(os.environ['BOOTSTRAP_PROGRESS_MARKER'])
try:
    actual = json.loads(path.read_text(encoding='utf-8'))
except Exception as error:
    raise SystemExit(f'production bootstrap progress marker is invalid: {error}')
if actual == expected:
    print('MATCH')
else:
    raise SystemExit('production bootstrap progress marker is not the exact same receipt and candidate')
PY
      )
      case \"\$bootstrap_marker_status\" in
        MATCH) bootstrap_progress=1 ;;
        *) echo '[错误] production bootstrap progress marker 状态无效'; exit 1 ;;
      esac
    fi
    expected_target='$REMOTE_DIR/releases/$RELEASE_BOOTSTRAP_LEGACY_RELEASE_ID'
    maintenance_marker='$REMOTE_WORKSPACE_CONFIG_DIR/maintenance-deploy'
    test -d \"\$expected_target\"
    current_target=\$(readlink -f '$REMOTE_DIR/current')
    if [ \"\$current_target\" = \"\$expected_target\" ]; then
      test -f \"\$expected_target/workspace/.next/BUILD_ID\"
      actual_build_id=\$(cat \"\$expected_target/workspace/.next/BUILD_ID\")
      if [ \"\$actual_build_id\" != '$RELEASE_BOOTSTRAP_LEGACY_BUILD_ID' ]; then
        echo '[错误] production bootstrap legacy filesystem BUILD_ID 已漂移'
        exit 1
      fi
    elif [ \"\$bootstrap_progress\" = '1' ]; then
      CURRENT_TARGET=\"\$current_target\" RELEASE_ROOT='$REMOTE_DIR/releases' EXPECTED_SHA='$RELEASE_SOURCE_SHA' EXPECTED_TREE='$RELEASE_SOURCE_TREE' EXPECTED_MIGRATION_SET='$RELEASE_MIGRATION_SET_SHA' node - <<'NODE'
const fs = require('fs');
const path = require('path');
const target = fs.realpathSync(process.env.CURRENT_TARGET);
const releaseRoot = fs.realpathSync(process.env.RELEASE_ROOT);
if (target !== releaseRoot && !target.startsWith(releaseRoot + path.sep)) {
  throw new Error('bootstrap retry candidate current is outside the release root');
}
if (!path.basename(target).endsWith('-' + process.env.EXPECTED_SHA.slice(0, 8))) {
  throw new Error('bootstrap retry candidate release id does not bind the source SHA');
}
const manifest = JSON.parse(fs.readFileSync(path.join(target, '.release-manifest.json'), 'utf8'));
const buildId = fs.readFileSync(path.join(target, 'workspace/.next/BUILD_ID'), 'utf8').trim();
if (manifest?.source?.commitSha !== process.env.EXPECTED_SHA
  || manifest?.source?.treeSha !== process.env.EXPECTED_TREE
  || manifest?.build?.buildId !== process.env.EXPECTED_SHA
  || manifest?.inputs?.migrationSetSha256 !== process.env.EXPECTED_MIGRATION_SET
  || buildId !== process.env.EXPECTED_SHA) {
  throw new Error('bootstrap retry candidate current identity does not match the progress receipt');
}
NODE
    else
      echo '[错误] production bootstrap current release 已漂移'
      exit 1
    fi
    if [ \"\$bootstrap_progress\" = '1' ]; then
      echo '==> bootstrap mutation-started marker 已存在；在任何网络复验前保持所有 writer 隔离'
      pm2 delete '$PM2_NAME-candidate' 2>/dev/null || true
      pm2 delete '$PM2_NAME' 2>/dev/null || true
      pm2 delete '$PM2_WECOM_BOT_NAME' 2>/dev/null || true
      pm2 save
    fi
    if [ -f \"\$maintenance_marker\" ]; then
      if [ \"\$bootstrap_progress\" != '1' ]; then
        echo '[错误] production bootstrap maintenance marker 缺少绑定 progress receipt'
        exit 1
      fi
      persisted_source=\$(sed -n 's/^sourceSha=//p' \"\$maintenance_marker\")
      if [ \"\$persisted_source\" != '$RELEASE_SOURCE_SHA' ]; then
        echo '[错误] production bootstrap maintenance marker 属于其他候选版本'
        exit 1
      fi
      echo '==> 已验证 maintenance/progress 身份；锁内主动隔离所有可能残留的 writer'
      pm2 delete '$PM2_NAME-candidate' 2>/dev/null || true
      pm2 delete '$PM2_NAME' 2>/dev/null || true
      pm2 delete '$PM2_WECOM_BOT_NAME' 2>/dev/null || true
      pm2 save
    fi
    pm2_list=\$(pm2 jlist)
    pm2_mode=\$(EXPECTED_TARGET=\"\$expected_target\" EXPECTED_PM2_NAME='$PM2_NAME' EXPECTED_CANDIDATE_NAME='$PM2_NAME-candidate' EXPECTED_WECOM_NAME='$PM2_WECOM_BOT_NAME' PM2_LIST=\"\$pm2_list\" python3 - <<'PY'
import json
import os
from pathlib import Path

target = Path(os.environ['EXPECTED_TARGET']).resolve(strict=True)
try:
    processes = json.loads(os.environ['PM2_LIST'])
except Exception as error:
    raise SystemExit(f'production bootstrap PM2 state is invalid: {error}')
if not isinstance(processes, list):
    raise SystemExit('production bootstrap PM2 state is not a list')
names = {
    os.environ['EXPECTED_PM2_NAME'],
    os.environ['EXPECTED_CANDIDATE_NAME'],
    os.environ['EXPECTED_WECOM_NAME'],
}
managed = [item for item in processes if isinstance(item, dict) and item.get('name') in names]
grouped = {name: [item for item in managed if item.get('name') == name] for name in names}
if any(len(items) > 1 for items in grouped.values()):
    raise SystemExit('production bootstrap PM2 contains duplicate managed process names')

workspace = grouped[os.environ['EXPECTED_PM2_NAME']][0] if grouped[os.environ['EXPECTED_PM2_NAME']] else None
candidate = grouped[os.environ['EXPECTED_CANDIDATE_NAME']][0] if grouped[os.environ['EXPECTED_CANDIDATE_NAME']] else None
wecom = grouped[os.environ['EXPECTED_WECOM_NAME']][0] if grouped[os.environ['EXPECTED_WECOM_NAME']] else None

def state(item):
    if item is None:
        return 'absent'
    environment = item.get('pm2_env') or {}
    status = environment.get('status')
    pid = item.get('pid')
    if status == 'stopped' and pid == 0:
        return 'stopped'
    if status == 'online' and isinstance(pid, int) and pid > 0:
        return 'online'
    return 'ambiguous'

def assert_bound(item, label):
    environment = item.get('pm2_env') or {}
    try:
        cwd = Path(environment['pm_cwd']).resolve(strict=True)
        executable = Path(environment['pm_exec_path']).resolve(strict=True)
        cwd.relative_to(target)
        executable.relative_to(target)
    except Exception:
        raise SystemExit(f'production bootstrap {label} PM2 cwd/exec is outside the legacy release')
    if not cwd.is_dir() or not executable.is_file():
        raise SystemExit(f'production bootstrap {label} PM2 cwd/exec is not readable')

candidate_state = state(candidate)
workspace_state = state(workspace)
wecom_state = state(wecom)
if candidate_state not in {'absent', 'stopped'}:
    raise SystemExit('production bootstrap candidate writer is not safely offline')
if workspace_state == 'online' and wecom_state in {'absent', 'stopped', 'online'}:
    assert_bound(workspace, 'Workspace')
    if wecom_state == 'online':
        assert_bound(wecom, 'WeCom')
    print('ONLINE')
elif workspace_state in {'absent', 'stopped'} and wecom_state in {'absent', 'stopped'}:
    print('OFFLINE')
else:
    raise SystemExit('production bootstrap PM2 writer state is ambiguous')
PY
    )
    database_progress=0
    if [ -f \"\$maintenance_marker\" ]; then
      if [ \"\$bootstrap_progress\" != '1' ] || [ \"\$pm2_mode\" != 'OFFLINE' ]; then
        echo '[错误] production bootstrap maintenance 状态缺少绑定凭证或 writer 未隔离'
        exit 1
      fi
      database_progress=1
    elif [ \"\$pm2_mode\" != 'ONLINE' ] && [ \"\$bootstrap_progress\" != '1' ]; then
      echo '[错误] production bootstrap 在非维护状态下必须保持旧 Workspace 在线'
      exit 1
    fi
    if [ \"\$pm2_mode\" = 'ONLINE' ]; then
      curl -fsS '$HEALTHCHECK_URL' >/dev/null
      version_response=\$(curl -fsS 'http://127.0.0.1:3000/workspace/api/settings/version')
      VERSION_RESPONSE=\"\$version_response\" EXPECTED_VERSION='$RELEASE_BOOTSTRAP_LEGACY_RUNTIME_VERSION' node - <<'NODE'
const payload = JSON.parse(process.env.VERSION_RESPONSE || 'null');
if (!payload || payload.version !== process.env.EXPECTED_VERSION) {
  throw new Error('production bootstrap runtime version has drifted');
}
NODE
    fi
    set -a
    . '$REMOTE_WORKSPACE_CONFIG_DIR/.env'
    set +a
    test -n \"\${DIRECT_URL:-}\"
    migration_rows=\$(psql \"\$DIRECT_URL\" -v ON_ERROR_STOP=1 -At -F '|' -c 'SELECT migration_name, checksum, CASE WHEN finished_at IS NULL THEN '\''0'\'' ELSE '\''1'\'' END, CASE WHEN rolled_back_at IS NULL THEN '\''0'\'' ELSE '\''1'\'' END, applied_steps_count::text FROM "_prisma_migrations" ORDER BY migration_name, id')
    MIGRATION_ROWS=\"\$migration_rows\" EXPECTED_COUNT='$RELEASE_BOOTSTRAP_MIGRATION_COUNT' EXPECTED_DIGEST='$RELEASE_BOOTSTRAP_MIGRATION_DIGEST' VALIDATION_MODE=\"\$database_progress\" python3 - <<'PY'
from hashlib import sha256
import os
import re

rows = []
for line in os.environ.get('MIGRATION_ROWS', '').splitlines():
    parts = line.split('|')
    if len(parts) != 5:
        raise SystemExit('production bootstrap migration row is malformed')
    name, checksum, finished, rolled_back, steps = parts
    if not re.fullmatch(r'[0-9]{14}_[a-z0-9_]+', name):
        raise SystemExit('production bootstrap migration name is invalid')
    if not re.fullmatch(r'[0-9a-f]{64}', checksum):
        raise SystemExit('production bootstrap migration checksum is invalid')
    if not steps.isdigit() or int(steps) < 0:
        raise SystemExit('production bootstrap migration applied-step count is invalid')
    rows.append((name, checksum, finished, rolled_back, int(steps)))
expected_count = int(os.environ['EXPECTED_COUNT'])
if len(rows) < expected_count:
    raise SystemExit('production bootstrap baseline migrations are missing')
baseline = rows[:expected_count]
if len({name for name, *_ in baseline}) != len(baseline):
    raise SystemExit('production bootstrap baseline migration names are duplicated')
if any(finished != '1' or rolled_back != '0' or steps < 1 for _, _, finished, rolled_back, steps in baseline):
    raise SystemExit('production bootstrap baseline migration state has drifted')
canonical = ''.join(f'{name}\t{checksum}\n' for name, checksum, *_ in baseline).encode()
if sha256(canonical).hexdigest() != os.environ['EXPECTED_DIGEST']:
    raise SystemExit('production bootstrap migration checksum set has drifted')
if os.environ['VALIDATION_MODE'] == '0' and len(rows) != expected_count:
    raise SystemExit('production bootstrap has migrations beyond the audited baseline before takeover')
if len(rows) > expected_count:
    last_baseline_name = baseline[-1][0]
    if any(name <= last_baseline_name for name, *_ in rows[expected_count:]):
        raise SystemExit('production bootstrap migration progress is not append-only')
PY
  "
}

verify_release_order() {
  local remote_state
  local record_kind=""
  local order_action
  local args
  local comparison_base=""
  local comparison_status
  local comparison_ahead
  local comparison_json=""

  remote_state="$(ssh_cmd "REMOTE_WORKSPACE_CONFIG_DIR='$REMOTE_WORKSPACE_CONFIG_DIR' EXPECTED_REPOSITORY='$RELEASE_CNB_REPOSITORY' EXPECTED_REF='$RELEASE_CNB_SOURCE_REF' python3 - <<'PY'
import json
import os
from pathlib import Path

path = Path(os.environ['REMOTE_WORKSPACE_CONFIG_DIR']) / 'deployed-release.json'
if not path.exists():
    print('MISSING')
else:
    try:
        record = json.loads(path.read_text(encoding='utf-8'))
        value = record['source']['commitSha']
        repository = record['cnb']['repository']
        source_ref = record['cnb']['sourceRef']
        artifact_digest = record['artifact']['digest']
    except Exception:
        print('INVALID')
    else:
        if (
            isinstance(value, str)
            and len(value) == 40
            and all(char in '0123456789abcdef' for char in value)
            and record.get('schemaVersion') == 2
            and isinstance(repository, str)
            and repository == os.environ.get('EXPECTED_REPOSITORY')
            and isinstance(source_ref, str)
            and source_ref == os.environ.get('EXPECTED_REF')
            and isinstance(artifact_digest, str)
            and len(artifact_digest) == 71
            and artifact_digest.startswith('sha256:')
            and all(char in '0123456789abcdef' for char in artifact_digest[7:])
        ):
            print('\t'.join(['RECORD', value, artifact_digest, repository, source_ref]))
        else:
            print('INVALID')
PY")"
  IFS=$'\t' read -r record_kind DEPLOYED_SOURCE_SHA DEPLOYED_ARTIFACT_DIGEST _deployed_repository _deployed_ref <<< "$remote_state"
  case "$record_kind" in
    MISSING)
      DEPLOYED_SOURCE_SHA=""
      DEPLOYED_ARTIFACT_DIGEST=""
      if [ -z "$RELEASE_BOOTSTRAP_BASE" ]; then
        echo "[错误] 生产部署记录缺失；只有经审计的一次性 production bootstrap 凭证可接管"
        exit 1
      fi
      ;;
    RECORD)
      if [ -n "$RELEASE_BOOTSTRAP_BASE" ]; then
        echo "[错误] production bootstrap 凭证在正式部署记录存在后必须失效"
        exit 1
      fi
      ;;
    *) echo "[错误] 服务器 deployed-release.json 无法证明当前生产版本"; exit 1 ;;
  esac

  args=(
    --candidate "$RELEASE_SOURCE_SHA"
    --candidate-artifact-digest "$RELEASE_ARTIFACT_DIGEST"
    --current-head "$RELEASE_SOURCE_SHA"
  )
  if [ -n "$RELEASE_BOOTSTRAP_BASE" ]; then
    args+=(--bootstrap-base "$RELEASE_BOOTSTRAP_BASE")
    comparison_base="$RELEASE_BOOTSTRAP_BASE"
  elif [ -n "$DEPLOYED_SOURCE_SHA" ]; then
    args+=(
      --deployed "$DEPLOYED_SOURCE_SHA"
      --deployed-artifact-digest "$DEPLOYED_ARTIFACT_DIGEST"
    )
    if [ "$DEPLOYED_SOURCE_SHA" != "$RELEASE_SOURCE_SHA" ]; then
      comparison_base="$DEPLOYED_SOURCE_SHA"
    fi
  fi
  if [ -n "$comparison_base" ]; then
    if ! git cat-file -e "${comparison_base}^{commit}" 2>/dev/null; then
      echo "[错误] 本地仓库缺少部署顺序基线提交: $comparison_base"
      exit 1
    fi
    if [ "$comparison_base" = "$RELEASE_SOURCE_SHA" ]; then
      comparison_status="identical"
      comparison_ahead=0
    else
      if ! git merge-base --is-ancestor "$comparison_base" "$RELEASE_SOURCE_SHA"; then
        echo "[错误] 候选 $RELEASE_SOURCE_SHA 不是部署基线 $comparison_base 的后代"
        exit 1
      fi
      if [ "$(git merge-base "$comparison_base" "$RELEASE_SOURCE_SHA")" != "$comparison_base" ]; then
        echo "[错误] 候选与部署基线的 merge-base 不精确"
        exit 1
      fi
      comparison_status="ahead"
      comparison_ahead="$(git rev-list --count "$comparison_base..$RELEASE_SOURCE_SHA")"
    fi
    comparison_json="{\"status\":\"$comparison_status\",\"ahead_by\":$comparison_ahead,\"base_commit\":{\"sha\":\"$comparison_base\"},\"merge_base_commit\":{\"sha\":\"$comparison_base\"},\"head_commit\":{\"sha\":\"$RELEASE_SOURCE_SHA\"}}"
    args+=(--comparison-json "$comparison_json")
  fi
  order_action="$(node ops/verify-deploy-order.mjs "${args[@]}")"
  if [ "$order_action" = "noop" ]; then
    echo "==> 生产记录已是 CNB source ${RELEASE_SOURCE_SHA:0:12}；锁内复验实时健康与版本。"
    run_healthcheck
    echo "==> 实时生产健康且版本一致，跳过重复部署。"
    exit 0
  fi
  if [ "$order_action" != "deploy" ]; then
    echo "[错误] 未知部署顺序判断: $order_action"
    exit 1
  fi
  verify_bootstrap_production_state
  echo "==> 锁内已证明候选与已提交发布证据一致，且不会回滚当前生产版本。"
}

require_local_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[错误] 当前 CI 容器缺少命令: $cmd"
    exit 1
  fi
}

resolve_cnb_release_request() {
  local values_file
  local line_count
  local injection_files

  test -f "$CNB_DEPLOY_REQUEST_FILE"
  test -f ops/cnb-deploy-request.mjs
  if ! printf '%s' "$CNB_RELEASE_SHA" | grep -Eq '^[0-9a-f]{40}$'; then
    echo "[错误] CNB_RELEASE_SHA 必须是完整 release commit SHA"
    exit 1
  fi
  if [ "$(git rev-parse HEAD)" != "$RELEASE_SOURCE_SHA" ] \
    || [ "$(git rev-parse 'HEAD^{tree}')" != "$RELEASE_SOURCE_TREE" ]; then
    echo "[错误] CNB build checkout 与 release source identity 不一致"
    exit 1
  fi
  if [ "$(git rev-parse "${CNB_RELEASE_SHA}^")" != "$RELEASE_SOURCE_SHA" ]; then
    echo "[错误] CNB release commit parent 不是构建 source SHA"
    exit 1
  fi
  injection_files="$(git diff-tree --no-commit-id --name-only -r "$CNB_RELEASE_SHA" | LC_ALL=C sort)"
  if [ "$injection_files" != $'.cnb-deploy-request.json\n.cnb.yml' ]; then
    echo "[错误] CNB release commit 只能注入 request 与 pipeline 配置"
    exit 1
  fi

  values_file="$(mktemp)"
  node ops/cnb-deploy-request.mjs validate \
    --cwd "$(pwd)" \
    --request "$CNB_DEPLOY_REQUEST_FILE" \
    --source-sha "$RELEASE_SOURCE_SHA" \
    --source-tree "$RELEASE_SOURCE_TREE" \
    --source-ref "$RELEASE_SOURCE_BRANCH" \
    --repository "$EXPECTED_CNB_REPOSITORY" \
    --format lines > "$values_file"
  line_count="$(wc -l < "$values_file" | tr -d '[:space:]')"
  if [ "$line_count" != "13" ]; then
    rm -f "$values_file"
    echo "[错误] CNB deploy request 输出字段数量异常"
    exit 1
  fi
  RELEASE_CNB_SOURCE_REF="$(sed -n '3p' "$values_file")"
  RELEASE_CNB_REPOSITORY="$(sed -n '4p' "$values_file")"
  RELEASE_BOOTSTRAP_BASE="$(sed -n '5p' "$values_file")"
  RELEASE_BOOTSTRAP_LEGACY_CNB_COMMIT="$(sed -n '6p' "$values_file")"
  RELEASE_BOOTSTRAP_LEGACY_RELEASE_ID="$(sed -n '7p' "$values_file")"
  RELEASE_BOOTSTRAP_LEGACY_CNB_BUILD_SN="$(sed -n '8p' "$values_file")"
  RELEASE_BOOTSTRAP_LEGACY_RUNTIME_VERSION="$(sed -n '9p' "$values_file")"
  RELEASE_BOOTSTRAP_LEGACY_BUILD_ID="$(sed -n '10p' "$values_file")"
  RELEASE_BOOTSTRAP_CNB_REPOSITORY="$(sed -n '11p' "$values_file")"
  RELEASE_BOOTSTRAP_MIGRATION_COUNT="$(sed -n '12p' "$values_file")"
  RELEASE_BOOTSTRAP_MIGRATION_DIGEST="$(sed -n '13p' "$values_file")"
  rm -f "$values_file"
  echo "==> 已验证 CNB-native source: ${RELEASE_SOURCE_SHA:0:12} via ${CNB_RELEASE_SHA:0:12}"
}

validate_cnb_artifact() {
  ARTIFACT_PATH="${STANDALONE_ARTIFACT_PATH:-.next/workspace-standalone.tgz}"
  ARTIFACT_MANIFEST_PATH="${STANDALONE_MANIFEST_PATH:-.next/workspace-standalone.manifest.json}"
  test -f "$ARTIFACT_PATH"
  test -f "$ARTIFACT_MANIFEST_PATH"
  artifact_values="$(node - "$ARTIFACT_PATH" "$ARTIFACT_MANIFEST_PATH" "$RELEASE_SOURCE_SHA" "$RELEASE_SOURCE_TREE" "$CNB_RELEASE_SHA" <<'NODE'
const { createHash } = require('crypto');
const { readFileSync, statSync } = require('fs');
const [artifactPath, manifestPath, sourceSha, sourceTree, releaseSha] = process.argv.slice(2);
const artifact = readFileSync(artifactPath);
const manifestBytes = readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes);
const artifactSha = createHash('sha256').update(artifact).digest('hex');
const manifestSha = createHash('sha256').update(manifestBytes).digest('hex');
if (manifest?.source?.commitSha !== sourceSha || manifest?.source?.treeSha !== sourceTree) {
  throw new Error('CNB artifact manifest source identity mismatch');
}
if (manifest?.build?.provenance?.provider !== 'cnb'
  || manifest?.build?.provenance?.releaseCommitSha !== releaseSha) {
  throw new Error('CNB artifact manifest provenance mismatch');
}
if (manifest?.artifact?.sha256 !== artifactSha || manifest?.artifact?.sizeBytes !== statSync(artifactPath).size) {
  throw new Error('CNB artifact digest or size mismatch');
}
if (!/^[0-9a-f]{64}$/.test(manifest?.inputs?.migrationSetSha256 ?? '')) {
  throw new Error('CNB artifact migration-set digest is invalid');
}
process.stdout.write(`${artifactSha}\n${manifestSha}\n${manifest.inputs.migrationSetSha256}\n`);
NODE
)"
  ARTIFACT_SHA="$(printf '%s\n' "$artifact_values" | sed -n '1p')"
  ARTIFACT_MANIFEST_SHA="$(printf '%s\n' "$artifact_values" | sed -n '2p')"
  RELEASE_MIGRATION_SET_SHA="$(printf '%s\n' "$artifact_values" | sed -n '3p')"
  RELEASE_ARTIFACT_DIGEST="sha256:$ARTIFACT_SHA"
  echo "==> 已验证 CNB 构建产物: $RELEASE_ARTIFACT_DIGEST"
}

run_local_checks() {
  echo "==> 安装 CI 依赖..."
  npm ci --no-audit --fund=false --loglevel=error

  echo "==> 运行静态检查..."
  npm run deploy:preflight:ci
  npm run docs:check
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
    if [ ! -f '$REMOTE_WORKSPACE_CONFIG_DIR/maintenance-deploy' ]; then
      rm -rf '$REMOTE_BACKUP_DIR/maintenance-pinned'
    fi
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
  local remote_manifest
  local remote_script

  release_id="$(date +%Y%m%d%H%M%S)-${RELEASE_SOURCE_SHA:0:8}"
  remote_tar="$REMOTE_WORKSPACE_CONFIG_DIR/deploy-workspace-standalone-$release_id.tgz"
  remote_manifest="$REMOTE_WORKSPACE_CONFIG_DIR/deploy-workspace-standalone-$release_id.manifest.json"
  remote_script="$REMOTE_WORKSPACE_CONFIG_DIR/deploy-remote-release-$release_id.sh"

  echo "==> 上传 CNB 构建产物到服务器..."
  rsync -av -e "$RSYNC_SSH_COMMAND" \
    "$ARTIFACT_PATH" "$SERVER:$remote_tar"
  rsync -av -e "$RSYNC_SSH_COMMAND" \
    "$ARTIFACT_MANIFEST_PATH" "$SERVER:$remote_manifest"

  echo "==> 上传后再次确认发布证据与部署顺序..."
  verify_release_order

  echo "==> 启动服务器原子发布事务..."
  rsync -av -e "$RSYNC_SSH_COMMAND" \
    ops/deploy/remote-release.sh "$SERVER:$remote_script"
  ssh_cmd "env \
    REMOTE_ARTIFACT_PATH='$remote_tar' \
    REMOTE_MANIFEST_PATH='$remote_manifest' \
    REMOTE_RELEASE_SCRIPT='$remote_script' \
    RELEASE_ID='$release_id' \
    ARTIFACT_SHA='$ARTIFACT_SHA' \
    ARTIFACT_MANIFEST_SHA='$ARTIFACT_MANIFEST_SHA' \
    RELEASE_ARTIFACT_DIGEST='$RELEASE_ARTIFACT_DIGEST' \
    RELEASE_SOURCE_SHA='$RELEASE_SOURCE_SHA' \
    RELEASE_SOURCE_TREE='$RELEASE_SOURCE_TREE' \
    RELEASE_MIGRATION_SET_SHA='$RELEASE_MIGRATION_SET_SHA' \
    RELEASE_CNB_REPOSITORY='$RELEASE_CNB_REPOSITORY' \
    RELEASE_CNB_SOURCE_REF='$RELEASE_CNB_SOURCE_REF' \
    CNB_RELEASE_SHA='$CNB_RELEASE_SHA' \
    DEPLOYED_SOURCE_SHA='$DEPLOYED_SOURCE_SHA' \
    DEPLOYED_ARTIFACT_DIGEST='$DEPLOYED_ARTIFACT_DIGEST' \
    RELEASE_BOOTSTRAP_BASE='$RELEASE_BOOTSTRAP_BASE' \
    RELEASE_BOOTSTRAP_LEGACY_CNB_COMMIT='$RELEASE_BOOTSTRAP_LEGACY_CNB_COMMIT' \
    RELEASE_BOOTSTRAP_LEGACY_RELEASE_ID='$RELEASE_BOOTSTRAP_LEGACY_RELEASE_ID' \
    RELEASE_BOOTSTRAP_LEGACY_CNB_BUILD_SN='$RELEASE_BOOTSTRAP_LEGACY_CNB_BUILD_SN' \
    RELEASE_BOOTSTRAP_LEGACY_RUNTIME_VERSION='$RELEASE_BOOTSTRAP_LEGACY_RUNTIME_VERSION' \
    RELEASE_BOOTSTRAP_LEGACY_BUILD_ID='$RELEASE_BOOTSTRAP_LEGACY_BUILD_ID' \
    RELEASE_BOOTSTRAP_CNB_REPOSITORY='$RELEASE_BOOTSTRAP_CNB_REPOSITORY' \
    RELEASE_BOOTSTRAP_MIGRATION_COUNT='$RELEASE_BOOTSTRAP_MIGRATION_COUNT' \
    RELEASE_BOOTSTRAP_MIGRATION_DIGEST='$RELEASE_BOOTSTRAP_MIGRATION_DIGEST' \
    REMOTE_DIR='$REMOTE_DIR' \
    REMOTE_WORKSPACE_CONFIG_DIR='$REMOTE_WORKSPACE_CONFIG_DIR' \
    REMOTE_BACKUP_DIR='$REMOTE_BACKUP_DIR' \
    REMOTE_AGENT_SOURCE_ROOT_NAME='$REMOTE_AGENT_SOURCE_ROOT_NAME' \
    PM2_NAME='$PM2_NAME' \
    PM2_WECOM_BOT_NAME='$PM2_WECOM_BOT_NAME' \
    HEALTHCHECK_URL='$HEALTHCHECK_URL' \
    bash '$remote_script'"
}

run_healthcheck() {
  echo "==> 健康检查与 canonical 版本复验..."
  ssh_cmd "
    set -e
    curl -fsS '$HEALTHCHECK_URL' >/dev/null
    version_response=\$(curl -fsS 'http://127.0.0.1:3000/workspace/api/settings/version')
    VERSION_RESPONSE=\"\$version_response\" EXPECTED_VERSION='$RELEASE_SOURCE_SHA' node - <<'NODE'
const payload = JSON.parse(process.env.VERSION_RESPONSE || 'null');
if (!payload || payload.version !== process.env.EXPECTED_VERSION) {
  throw new Error('post-deploy version endpoint does not match canonical source SHA');
}
NODE
  "
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

echo "==> 校验 CNB release request 与 source identity..."
resolve_cnb_release_request

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

validate_cnb_artifact

echo "==> 验证服务器连接..."
start_ssh_master
ssh_cmd "echo CONNECTED && whoami && mkdir -p '$REMOTE_DIR'"
acquire_remote_deploy_lock
reconcile_completed_deploy_markers
verify_release_order

SERVER="$SERVER" \
REMOTE_DIR="$REMOTE_DIR" \
REMOTE_WORKSPACE_CONFIG_DIR="$REMOTE_WORKSPACE_CONFIG_DIR" \
REMOTE_AGENT_SOURCE_DIR="$REMOTE_AGENT_SOURCE_DIR" \
REMOTE_AGENT_SOURCE_REPO_URL="$REMOTE_AGENT_SOURCE_REPO_URL" \
RELEASE_SOURCE_SHA="$RELEASE_SOURCE_SHA" \
RELEASE_SOURCE_TREE="$RELEASE_SOURCE_TREE" \
ENV_CONTENT_B64="$ENV_CONTENT_B64" \
LIBRARY_SYNC_SOURCE="$LIBRARY_SYNC_SOURCE" \
INSTALL_LIBRARY_RUNTIME_DEPS="$INSTALL_LIBRARY_RUNTIME_DEPS" \
INSTALL_KIMI_AGENT_RUNTIME_DEPS="$INSTALL_KIMI_AGENT_RUNTIME_DEPS" \
DEPLOY_SSH_KEY="$SSH_KEY" \
DEPLOY_SSH_CONTROL_PATH="$SSH_CONTROL_PATH" \
DEPLOY_SSH_CONTROL_PERSIST_SECONDS="$SSH_CONTROL_PERSIST_SECONDS" \
  bash ops/deploy/runtime-provision.sh
verify_release_order
backup_remote_postgresql
backup_remote_runtime
cleanup_remote_backups
deploy_remote_artifact
run_healthcheck
notify_workspace_bot_deploy

echo ""
echo "==> CNB 产物部署完成"
