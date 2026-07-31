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
    load_control_environment
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
  local deployed_repository=""
  local order_action
  local args
  local comparison_base=""
  local comparison_status
  local comparison_ahead
  local comparison_json=""

  remote_state="$(ssh_cmd "
    deployed_record='$REMOTE_WORKSPACE_CONFIG_DIR/deployed-release.json'
    if [ ! -f \"\$deployed_record\" ]; then
      echo MISSING
    elif ! node '$REMOTE_RELEASE_RECEIPT_TOOL' inspect \
      --file \"\$deployed_record\" \
      --expected-repository '$RELEASE_CNB_REPOSITORY' \
      --format tsv; then
      echo INVALID
    fi
  ")"
  IFS=$'\t' read -r \
    record_kind \
    DEPLOYED_SOURCE_SHA \
    DEPLOYED_SOURCE_TREE \
    DEPLOYED_CANONICAL_SOURCE_SHA \
    DEPLOYED_CANONICAL_SOURCE_TREE \
    DEPLOYED_CNB_INJECTION_SHA \
    DEPLOYED_ARTIFACT_SHA \
    deployed_repository \
    DEPLOYED_CNB_BRANCH \
    DEPLOYED_MIGRATION_SET_SHA <<< "$remote_state"
  case "$record_kind" in
    MISSING)
      DEPLOYED_SOURCE_SHA=""
      DEPLOYED_SOURCE_TREE=""
      DEPLOYED_CANONICAL_SOURCE_SHA=""
      DEPLOYED_CANONICAL_SOURCE_TREE=""
      DEPLOYED_CNB_INJECTION_SHA=""
      DEPLOYED_ARTIFACT_SHA=""
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
      if [ -z "$DEPLOYED_SOURCE_TREE" ]; then
        DEPLOYED_SOURCE_TREE="$(git rev-parse "${DEPLOYED_SOURCE_SHA}^{tree}")"
      fi
      if [ -z "$DEPLOYED_CANONICAL_SOURCE_TREE" ]; then
        DEPLOYED_CANONICAL_SOURCE_TREE="$(git rev-parse "${DEPLOYED_CANONICAL_SOURCE_SHA}^{tree}")"
      fi
      if [ -n "$RELEASE_GENESIS_FROM_SOURCE" ] && [ "$DEPLOYED_SOURCE_SHA" != "$RELEASE_GENESIS_FROM_SOURCE" ]; then
        echo "[错误] genesis reset 只授权从 $RELEASE_GENESIS_FROM_SOURCE 切换；当前生产是 $DEPLOYED_SOURCE_SHA"
        exit 1
      fi
      if [ -n "$RELEASE_RECEIPT_RECOVERY_BASE" ]; then
        if [ "$DEPLOYED_SOURCE_SHA" != "$RELEASE_RECEIPT_RECOVERY_SOURCE" ] \
          || [ "$DEPLOYED_SOURCE_TREE" != "$RELEASE_RECEIPT_RECOVERY_TREE" ] \
          || [ "$DEPLOYED_CANONICAL_SOURCE_SHA" != "$RELEASE_RECEIPT_RECOVERY_SOURCE" ] \
          || [ "$DEPLOYED_CANONICAL_SOURCE_TREE" != "$RELEASE_RECEIPT_RECOVERY_TREE" ] \
          || [ "$DEPLOYED_CNB_INJECTION_SHA" != "$RELEASE_RECEIPT_RECOVERY_SOURCE" ] \
          || [ "$DEPLOYED_MIGRATION_SET_SHA" != "$RELEASE_RECEIPT_RECOVERY_MIGRATION_SET" ]; then
          echo "[错误] 待修复的 legacy local 回执已变化；拒绝继续"
          exit 1
        fi
        ssh_cmd "node '$REMOTE_RELEASE_RECEIPT_TOOL' assert \
          --file '$REMOTE_WORKSPACE_CONFIG_DIR/deployed-release.json' \
          --expected-repository '$RELEASE_CNB_REPOSITORY' \
          --runtime-source '$RELEASE_RECEIPT_RECOVERY_SOURCE' \
          --runtime-tree '$RELEASE_RECEIPT_RECOVERY_TREE' \
          --canonical-source '$RELEASE_RECEIPT_RECOVERY_SOURCE' \
          --canonical-tree '$RELEASE_RECEIPT_RECOVERY_TREE' \
          --cnb-injection '$RELEASE_RECEIPT_RECOVERY_SOURCE' \
          --migration-set '$RELEASE_RECEIPT_RECOVERY_MIGRATION_SET' \
          --transport local" >/dev/null
      fi
      ;;
    *) echo "[错误] 服务器 deployed-release.json 无法证明当前生产版本"; exit 1 ;;
  esac

  args=(--candidate "$RELEASE_SOURCE_SHA" --current-head "$RELEASE_SOURCE_SHA")
  if [ -n "$RELEASE_GENESIS_FROM_SOURCE" ]; then
    [ "$record_kind" = "RECORD" ] || { echo "[错误] genesis reset 需要正式生产回执"; exit 1; }
    order_action="deploy"
    comparison_base=""
  elif [ -n "$RELEASE_BOOTSTRAP_BASE" ]; then
    args+=(--bootstrap-base "$RELEASE_BOOTSTRAP_BASE")
    comparison_base="$RELEASE_BOOTSTRAP_BASE"
  elif [ -n "$RELEASE_RECEIPT_RECOVERY_BASE" ]; then
    [ "$record_kind" = "RECORD" ] || { echo "[错误] legacy local 回执修复需要正式生产回执"; exit 1; }
    args+=(--deployed "$RELEASE_RECEIPT_RECOVERY_BASE")
    comparison_base="$RELEASE_RECEIPT_RECOVERY_BASE"
  elif [ -n "$DEPLOYED_SOURCE_SHA" ]; then
    args+=(--deployed "$DEPLOYED_SOURCE_SHA")
    comparison_base="$DEPLOYED_SOURCE_SHA"
    if [ "$comparison_base" = "$RELEASE_SOURCE_SHA" ]; then
      comparison_base=""
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
  if [ -z "$RELEASE_GENESIS_FROM_SOURCE" ]; then
    order_action="$(node ops/verify-deploy-order.mjs "${args[@]}")"
  fi
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
  RELEASE_CANONICAL_SOURCE_SHA="$RELEASE_SOURCE_SHA"
  RELEASE_CANONICAL_SOURCE_TREE="$RELEASE_SOURCE_TREE"
  if [ -n "$RELEASE_GENESIS_FROM_SOURCE" ]; then
    echo "==> 锁内已证明一次性 genesis 切换基线精确匹配当前生产。"
  elif [ -n "$RELEASE_RECEIPT_RECOVERY_BASE" ]; then
    echo "==> 锁内已证明 legacy local 回执与恢复基线未漂移；本次成功后写回 canonical source。"
  else
    echo "==> 锁内已证明 CNB 候选顺序有效。"
  fi
}
