#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
if [ "${WORKSPACE_REPO_RUNTIME_READY:-0}" != "1" ]; then
  exec "$REPOSITORY_ROOT/scripts/runtime/run-with-repo-node.sh" "$0" "$@"
fi
OPS_ENV_FILE="${OPS_ENV_FILE:-$SCRIPT_DIR/.env}"
# shellcheck source=/dev/null
source "$OPS_ENV_FILE"
SOURCE_DIR="${RELEASE_SOURCE_DIR:-${SOURCE_DIR:-}}"
WORKSPACE_CONFIG_DIR="${WORKSPACE_CONFIG_DIR:-${LOCAL_WORKSPACE_CONFIG_DIR:-}}"
export WORKSPACE_CONFIG_DIR
CNB_REAL_CNB_YML="${CNB_REAL_CNB_YML:-$WORKSPACE_CONFIG_DIR/config/tenant/cnb-release.yml}"

: "${SOURCE_DIR:?SOURCE_DIR not set in $OPS_ENV_FILE}"
: "${RELEASE_BRANCH:?RELEASE_BRANCH not set in $OPS_ENV_FILE}"
: "${CNB_REMOTE:?CNB_REMOTE not set in $OPS_ENV_FILE}"
: "${CNB_REPO:?CNB_REPO not set in $OPS_ENV_FILE}"
: "${SERVER:?SERVER not set in $OPS_ENV_FILE}"
: "${REMOTE_DIR:?REMOTE_DIR not set in $OPS_ENV_FILE}"
: "${HEALTHCHECK_URL:?HEALTHCHECK_URL not set in $OPS_ENV_FILE}"
: "${WORKSPACE_CONFIG_DIR:?WORKSPACE_CONFIG_DIR not set in $OPS_ENV_FILE}"

BOOTSTRAP_PRODUCTION_BASE=""
BOOTSTRAP_LEGACY_CNB_COMMIT=""
BOOTSTRAP_LEGACY_RELEASE_ID=""
BOOTSTRAP_LEGACY_CNB_BUILD_SN=""
BOOTSTRAP_LEGACY_RUNTIME_VERSION=""
BOOTSTRAP_LEGACY_BUILD_ID=""
GENESIS_PRODUCTION_BASE=""
PRINT_COMMAND_ONLY=0
DEPLOY_UNIT_ID=""
DEPLOY_UNIT_MODE=""
DEPLOY_WAIT_SECONDS="${DEPLOY_WAIT_SECONDS:-1800}"
LOCAL_PREFLIGHT_DURATION_SECONDS=0
TENANT_SYNC_DURATION_SECONDS=0
RELEASE_TRIGGER_DURATION_SECONDS=0
RELEASE_PROCESS_SECONDS=0
RELEASE_ATTEMPT_COUNT=1
RELEASE_PROCESS_STARTED_AT=""
RELEASE_PROCESS_TIMING_FILE="${RELEASE_PROCESS_TIMING_FILE:-}"
TMP_DIR=""
TMP_KEY=""
SERVER_READ_KEY=""
DEPLOY_ATTEMPT_STARTED_EPOCH_SECONDS=""
DEPLOY_ATTEMPT_RECORDED=0

usage() {
  cat <<'EOF'
用法:
  OPS_ENV_FILE=/path/to/ops/.env publish-cnb.sh [选项]

部署只使用本地已确认提交、CNB 仓库/流水线和生产服务器；不会连接 GitHub。

选项:
  --bootstrap-production-base SHA
  --bootstrap-legacy-cnb-commit SHA
  --bootstrap-legacy-release-id ID
  --bootstrap-legacy-cnb-build-sn SN
  --bootstrap-legacy-runtime-version VERSION
  --bootstrap-legacy-build-id BUILD_ID
  --genesis-production-base SHA  一次性把已部署旧历史切换到单提交、schema-only 基线
  --deploy-unit UNIT  公开部署并原子切换一个 active 单元
  --shadow-unit UNIT  将一个 candidate/active 单元部署到 shadow，不切公网 Gateway
  --print-command
EOF
}

record_failed_deploy_attempt() {
  local exit_code="$1"
  [ "$PRINT_COMMAND_ONLY" = "0" ] || return 0
  [ "$DEPLOY_ATTEMPT_RECORDED" = "0" ] || return 0
  [ -n "${SERVER_READ_KEY:-}" ] && [ -f "$SERVER_READ_KEY" ] || return 0
  [ -n "${SOURCE_SHA:-}" ] && [ -n "${DEPLOY_ATTEMPT_STARTED_EPOCH_SECONDS:-}" ] || return 0
  local status="failed"
  case "$exit_code" in
    130|143) status="cancelled" ;;
  esac
  local duration_seconds="$(($(date +%s) - DEPLOY_ATTEMPT_STARTED_EPOCH_SECONDS))"
  [ "$duration_seconds" -ge 0 ] || duration_seconds=0
  if ssh -i "$SERVER_READ_KEY" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "$SERVER" \
    "REMOTE_DIR='$REMOTE_DIR' DEPLOY_SOURCE_SHA='$SOURCE_SHA' DEPLOY_STARTED_EPOCH_SECONDS='$DEPLOY_ATTEMPT_STARTED_EPOCH_SECONDS' DEPLOY_DURATION_SECONDS='$duration_seconds' DEPLOY_STATUS='$status' DEPLOY_EXIT_CODE='$exit_code' python3 - <<'PY'
import datetime
import json
import os
from pathlib import Path

remote_dir = Path(os.environ['REMOTE_DIR'])
build = os.environ['DEPLOY_SOURCE_SHA']
started = int(os.environ['DEPLOY_STARTED_EPOCH_SECONDS'])
duration = int(os.environ['DEPLOY_DURATION_SECONDS'])
status = os.environ['DEPLOY_STATUS']
exit_code = int(os.environ['DEPLOY_EXIT_CODE'])
finished_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
event_id = f'attempt:{build}:{started}'
payload = {
    'schemaVersion': 2,
    'kind': 'workspace-deploy-event',
    'id': event_id,
    'transport': 'cnb',
    'deploymentKind': 'full',
    'deploymentMode': 'full',
    'action': 'deploy',
    'status': status,
    'package': 'unknown',
    'build': build,
    'release': f'attempt-{build[:12]}',
    'durationSeconds': duration,
    'opsDurationSeconds': duration,
    'exitCode': exit_code,
    'startedAtEpochSeconds': started,
    'finishedAt': finished_at,
}

def atomic_write(target, body):
    tmp = target.with_name(f'.{target.name}.tmp-{os.getpid()}')
    tmp.write_text(body)
    os.chmod(tmp, 0o600)
    tmp.replace(target)

body = json.dumps(payload, ensure_ascii=False)
target = Path.home() / '.finance-bot-deploy-event.json'
atomic_write(target, body)
history_root = remote_dir / '.workspace' / 'deployment-history'
history_root.mkdir(parents=True, exist_ok=True, mode=0o700)
os.chmod(history_root, 0o700)
latest = history_root / 'latest.json'
duplicate = False
if latest.exists():
    try:
        duplicate = json.loads(latest.read_text()).get('id') == event_id
    except (OSError, ValueError):
        pass
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
atomic_write(history_root / f'{stamp}-{build[:12]}-{status}.json', body)
atomic_write(latest, body)
if not duplicate:
    history_log = history_root / 'deployments.ndjson'
    with history_log.open('a') as handle:
        handle.write(body + '\n')
    os.chmod(history_log, 0o600)
print(f'Workspace deploy attempt recorded: {event_id} ({status}, {duration}s)')
PY"; then
    DEPLOY_ATTEMPT_RECORDED=1
  else
    echo "[警告] 部署失败事件未能写入服务器；原始退出码仍为 $exit_code" >&2
  fi
}

cleanup() {
  local exit_code=$?
  if [ "$exit_code" -ne 0 ]; then
    record_failed_deploy_attempt "$exit_code" || true
  fi
  rm -rf "${TMP_DIR:-}"
  rm -f "${TMP_KEY:-}"
  return "$exit_code"
}
trap cleanup EXIT

prepare_server_read_key() {
  if [ -n "${KEY:-}" ] && [ -f "$KEY" ]; then
    SERVER_READ_KEY="$KEY"
  elif [ -n "${KEY_CONTENT:-}" ]; then
    TMP_KEY="$(mktemp)"
    printf '%s\n' "$KEY_CONTENT" > "$TMP_KEY"
    chmod 600 "$TMP_KEY"
    SERVER_READ_KEY="$TMP_KEY"
  else
    echo "[错误] 缺少生产只读验证所需 KEY/KEY_CONTENT"
    exit 1
  fi
}

format_duration() {
  local total_seconds="$1"
  printf '%dm %02ds' "$((total_seconds / 60))" "$((total_seconds % 60))"
}

print_deploy_timing_summary() {
  local total_seconds="$1"
  local cnb_status_file="$2"
  local ops_total_seconds="$((RELEASE_PROCESS_SECONDS + total_seconds))"
  echo "==> Ops 总耗时: $(format_duration "$ops_total_seconds") (${ops_total_seconds}s)"
  echo "==> Ops 耗时拆分（main 处理与 CI 已排除）:"
  echo "    release 流程处理 $(format_duration "$RELEASE_PROCESS_SECONDS")（${RELEASE_ATTEMPT_COUNT} 次尝试）"
  echo "    生产部署        $(format_duration "$total_seconds")"
  echo "    租户配置同步    $(format_duration "$TENANT_SYNC_DURATION_SECONDS")"
  echo "    CNB 注入与触发  $(format_duration "$RELEASE_TRIGGER_DURATION_SECONDS")"
  if ! node ops/cnb-build-timing-summary.mjs --input "$cnb_status_file"; then
    echo "    [警告] CNB 阶段耗时解析失败；部署结果不受影响"
  fi
  echo "    Ops 合计        $(format_duration "$ops_total_seconds") (${ops_total_seconds}s)"
}

record_final_full_deploy_event() {
  local total_seconds="$1"
  local finished_at="$2"
  local cnb_status_file="$3"
  local release_id="$4"
  local package_version
  local event_file="$TMP_DIR/final-full-deploy-event.json"
  local remote_notification_root="$REMOTE_DIR/.workspace/runtime/deploy-notification"
  local remote_tool="$remote_notification_root/deploy-notification.mjs"
  local remote_tool_tmp="$remote_notification_root/deploy-notification.tmp.mjs"
  local remote_summary_tool="$remote_notification_root/cnb-build-timing-summary.mjs"
  local remote_summary_tool_tmp="$remote_notification_root/cnb-build-timing-summary.tmp.mjs"
  local remote_event="$remote_notification_root/final-full-${SOURCE_SHA}-${CNB_SN}.json"

  package_version="$(node -p "require('./package.json').version")"
  node ops/deploy-notification.mjs full-write \
    --source-sha "$SOURCE_SHA" \
    --release-id "$release_id" \
    --cnb-build-sn "$CNB_SN" \
    --cnb-status-file "$cnb_status_file" \
    --package-version "$package_version" \
    --duration-seconds "$total_seconds" \
    --release-process-seconds "$RELEASE_PROCESS_SECONDS" \
    --release-attempt-count "$RELEASE_ATTEMPT_COUNT" \
    --release-process-started-at "$RELEASE_PROCESS_STARTED_AT" \
    --local-preflight-seconds "$LOCAL_PREFLIGHT_DURATION_SECONDS" \
    --tenant-sync-seconds "$TENANT_SYNC_DURATION_SECONDS" \
    --release-trigger-seconds "$RELEASE_TRIGGER_DURATION_SECONDS" \
    --finished-at "$finished_at" \
    --event-file "$event_file"

  ssh -i "$SERVER_READ_KEY" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "$SERVER" \
    "mkdir -p '$remote_notification_root' && chmod 700 '$remote_notification_root'"
  rsync -az -e "ssh -i $SERVER_READ_KEY -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new" \
    ops/deploy-notification.mjs "$SERVER:$remote_tool_tmp"
  rsync -az -e "ssh -i $SERVER_READ_KEY -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new" \
    ops/cnb-build-timing-summary.mjs "$SERVER:$remote_summary_tool_tmp"
  rsync -az -e "ssh -i $SERVER_READ_KEY -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new" \
    "$event_file" "$SERVER:$remote_event"
  ssh -i "$SERVER_READ_KEY" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "$SERVER" \
    "set -e
     chmod 600 '$remote_tool_tmp' '$remote_summary_tool_tmp' '$remote_event'
     node --check '$remote_tool_tmp'
     node --check '$remote_summary_tool_tmp'
     mv '$remote_summary_tool_tmp' '$remote_summary_tool'
     mv '$remote_tool_tmp' '$remote_tool'
     node '$remote_tool' event-write \
       --input '$remote_event' \
       --event-file \"\$HOME/.finance-bot-deploy-event.json\" \
       --history-dir '$REMOTE_DIR/.workspace/deployment-history'
     rm -f '$remote_event'"
  DEPLOY_ATTEMPT_RECORDED=1
  echo "==> 最终 Full 部署事件已在 CNB terminal success 后记录。"
}

complete_release_process_session() {
  if ! node "$SCRIPT_DIR/release-process-timing.mjs" complete \
    --file "$RELEASE_PROCESS_TIMING_FILE" >/dev/null; then
    echo "[警告] 生产已成功，但 release 流程计时会话未能结账；下次部署前需修复该状态文件" >&2
  fi
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --bootstrap-production-base) shift; BOOTSTRAP_PRODUCTION_BASE="${1:-}" ;;
    --bootstrap-legacy-cnb-commit) shift; BOOTSTRAP_LEGACY_CNB_COMMIT="${1:-}" ;;
    --bootstrap-legacy-release-id) shift; BOOTSTRAP_LEGACY_RELEASE_ID="${1:-}" ;;
    --bootstrap-legacy-cnb-build-sn) shift; BOOTSTRAP_LEGACY_CNB_BUILD_SN="${1:-}" ;;
    --bootstrap-legacy-runtime-version) shift; BOOTSTRAP_LEGACY_RUNTIME_VERSION="${1:-}" ;;
    --bootstrap-legacy-build-id) shift; BOOTSTRAP_LEGACY_BUILD_ID="${1:-}" ;;
    --genesis-production-base) shift; GENESIS_PRODUCTION_BASE="${1:-}" ;;
    --deploy-unit)
      [ -z "$DEPLOY_UNIT_ID" ] || { echo "[错误] 只能指定一个单元部署目标"; exit 2; }
      shift; DEPLOY_UNIT_ID="${1:-}"; DEPLOY_UNIT_MODE="activate"
      ;;
    --shadow-unit)
      [ -z "$DEPLOY_UNIT_ID" ] || { echo "[错误] 只能指定一个单元部署目标"; exit 2; }
      shift; DEPLOY_UNIT_ID="${1:-}"; DEPLOY_UNIT_MODE="shadow"
      ;;
    --print-command) PRINT_COMMAND_ONLY=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "[错误] 未知参数: $1"; usage; exit 1 ;;
  esac
  shift
done

if [ -n "$DEPLOY_UNIT_ID" ] && ! printf '%s' "$DEPLOY_UNIT_ID" | grep -Eq '^[a-z][a-z0-9-]*$'; then
  echo "[错误] deploy unit id 无效: $DEPLOY_UNIT_ID"
  exit 1
fi

case "$DEPLOY_WAIT_SECONDS" in
  ''|*[!0-9]*) echo "[错误] DEPLOY_WAIT_SECONDS 必须是正整数"; exit 1 ;;
esac
[ "$DEPLOY_WAIT_SECONDS" -ge 1 ] || { echo "[错误] DEPLOY_WAIT_SECONDS 必须至少为 1"; exit 1; }

bootstrap_count=0
for value in "$BOOTSTRAP_LEGACY_CNB_COMMIT" "$BOOTSTRAP_LEGACY_RELEASE_ID" "$BOOTSTRAP_LEGACY_CNB_BUILD_SN" "$BOOTSTRAP_LEGACY_RUNTIME_VERSION" "$BOOTSTRAP_LEGACY_BUILD_ID"; do
  [ -z "$value" ] || bootstrap_count=$((bootstrap_count + 1))
done
if [ -n "$BOOTSTRAP_PRODUCTION_BASE" ]; then
  [ "$bootstrap_count" = "5" ] || { echo "[错误] production bootstrap 必须提供完整 legacy receipt"; exit 1; }
  [ "$PRINT_COMMAND_ONLY" = "0" ] || { echo "[错误] production bootstrap 禁止 --print-command"; exit 1; }
else
  [ "$bootstrap_count" = "0" ] || { echo "[错误] legacy receipt 只能与 production bootstrap 同时使用"; exit 1; }
fi
if [ -n "$GENESIS_PRODUCTION_BASE" ]; then
  [ -z "$BOOTSTRAP_PRODUCTION_BASE" ] || { echo "[错误] genesis reset 不能与 production bootstrap 同时使用"; exit 1; }
  [ "$PRINT_COMMAND_ONLY" = "0" ] || { echo "[错误] genesis reset 禁止 --print-command"; exit 1; }
  [ -z "$DEPLOY_UNIT_ID" ] || { echo "[错误] genesis reset 只能执行 Full monolith 部署"; exit 1; }
fi

for pair in \
  "$BOOTSTRAP_PRODUCTION_BASE:production bootstrap SHA" \
  "$BOOTSTRAP_LEGACY_CNB_COMMIT:legacy CNB commit" \
  "$GENESIS_PRODUCTION_BASE:production genesis baseline SHA"; do
  value="${pair%%:*}"
  label="${pair#*:}"
  if [ -n "$value" ] && ! printf '%s' "$value" | grep -Eq '^[0-9a-f]{40}$'; then
    echo "[错误] $label 必须是 40 位小写 Git SHA"
    exit 1
  fi
done
if [ -n "$BOOTSTRAP_LEGACY_RELEASE_ID" ] && ! printf '%s' "$BOOTSTRAP_LEGACY_RELEASE_ID" | grep -Eq '^[0-9]{14}-[0-9a-f]{8}$'; then
  echo "[错误] legacy release id 格式无效"; exit 1
fi
if [ -n "$BOOTSTRAP_LEGACY_CNB_BUILD_SN" ] && ! printf '%s' "$BOOTSTRAP_LEGACY_CNB_BUILD_SN" | grep -Eq '^cnb-[a-z0-9]+(-[a-z0-9]+)*$'; then
  echo "[错误] legacy CNB build SN 格式无效"; exit 1
fi

cd "$SOURCE_DIR"
[ "$(git rev-parse --abbrev-ref HEAD)" = "$RELEASE_BRANCH" ] || { echo "[错误] deploy 只能从本地 $RELEASE_BRANCH 执行"; exit 1; }
[ -z "$(git status --short)" ] || { echo "[错误] 工作区存在未提交改动"; git status --short; exit 1; }

SOURCE_SHA="$(git rev-parse HEAD)"
SOURCE_TREE="$(git rev-parse 'HEAD^{tree}')"
if [ -n "$DEPLOY_UNIT_ID" ]; then
  LOCAL_RELEASE_GATE_RECEIPT_FILE="${LOCAL_RELEASE_GATE_RECEIPT_FILE:-$SOURCE_DIR/.cache/release-check/units/$DEPLOY_UNIT_ID.json}"
  local_release_gate_verify_args=(--scope unit --unit "$DEPLOY_UNIT_ID")
else
  LOCAL_RELEASE_GATE_RECEIPT_FILE="${LOCAL_RELEASE_GATE_RECEIPT_FILE:-$SOURCE_DIR/.cache/release-check/local-release-gate.json}"
  local_release_gate_verify_args=(--scope full)
fi
[ -f "$CNB_REAL_CNB_YML" ] || { echo "[错误] 真实 CNB 配置文件不存在: $CNB_REAL_CNB_YML"; exit 1; }
node "$SCRIPT_DIR/validate-cnb-release-config.mjs" "$CNB_REAL_CNB_YML"
OPS_ENV_FILE="$OPS_ENV_FILE" WORKSPACE_CONFIG_DIR="$WORKSPACE_CONFIG_DIR" \
  "$SCRIPT_DIR/sync-tenant-config.sh" --dry-run --source-sha "$SOURCE_SHA"
if ! node "$SCRIPT_DIR/local-release-gate-receipt.mjs" verify \
  --source "$SOURCE_SHA" --tree "$SOURCE_TREE" \
  "${local_release_gate_verify_args[@]}" \
  --file "$LOCAL_RELEASE_GATE_RECEIPT_FILE" >/dev/null; then
  echo "[错误] 当前 release tree 没有有效 prepare 回执；拒绝进入 CNB。" >&2
  if [ -n "$DEPLOY_UNIT_ID" ]; then
    echo "[提示] 先运行: OPS_ENV_FILE=$OPS_ENV_FILE ops/publish.sh prepare --deploy-unit $DEPLOY_UNIT_ID" >&2
  else
    echo "[提示] 先运行: OPS_ENV_FILE=$OPS_ENV_FILE ops/publish.sh prepare" >&2
  fi
  exit 1
fi
DEPLOY_ATTEMPT_STARTED_EPOCH_SECONDS="$(date +%s)"
PUBLISH_STARTED_EPOCH_SECONDS="$DEPLOY_ATTEMPT_STARTED_EPOCH_SECONDS"
PUBLISH_STARTED_AT="$(date '+%Y-%m-%d %H:%M:%S %z')"
export PUBLISH_STARTED_EPOCH_SECONDS PUBLISH_STARTED_AT
RELEASE_PROCESS_TIMING_FILE="${RELEASE_PROCESS_TIMING_FILE:-$SOURCE_DIR/.cache/release-process-timing.json}"
if [ ! -f "$RELEASE_PROCESS_TIMING_FILE" ]; then
  node "$SCRIPT_DIR/release-process-timing.mjs" begin \
    --file "$RELEASE_PROCESS_TIMING_FILE" \
    --repository-root "$SOURCE_DIR" \
    --source-sha "$SOURCE_SHA" >/dev/null
fi
if [ -n "$DEPLOY_UNIT_ID" ]; then
  deploy_unit_contract="$(node --conditions=react-server --import tsx scripts/deploy/render-deploy-unit-contract.ts --unit "$DEPLOY_UNIT_ID")"
  deploy_unit_maturity="$(printf '%s' "$deploy_unit_contract" | node -e 'let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).maturity))')"
  if [ "$DEPLOY_UNIT_MODE" = "activate" ]; then
    [ "$deploy_unit_maturity" = "active" ] || {
      echo "[错误] ${DEPLOY_UNIT_ID} 当前 maturity=${deploy_unit_maturity}，不能公开部署；先用 --shadow-unit 完成演练"; exit 1;
    }
  else
    case "$deploy_unit_maturity" in
      candidate|active) ;;
      *) echo "[错误] ${DEPLOY_UNIT_ID} 当前 maturity=${deploy_unit_maturity}，不能进入 shadow"; exit 1 ;;
    esac
  fi
  echo "==> 分模块部署目标: $DEPLOY_UNIT_ID ($deploy_unit_maturity, $DEPLOY_UNIT_MODE)"
fi
LOCAL_PREFLIGHT_STARTED_EPOCH_SECONDS="$(date +%s)"
EXPECTED_NODE_MAJOR="$(tr -d '[:space:]' < .node-version)"
ACTUAL_NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$ACTUAL_NODE_MAJOR" != "$EXPECTED_NODE_MAJOR" ]; then
  echo "[错误] 本地全量 CI 必须使用 Node ${EXPECTED_NODE_MAJOR}；当前是 $(node --version)"
  exit 1
fi
if [ -n "$BOOTSTRAP_PRODUCTION_BASE" ]; then
  git merge-base --is-ancestor "$BOOTSTRAP_PRODUCTION_BASE" "$SOURCE_SHA" || {
    echo "[错误] 候选不是 production bootstrap baseline 的后代"; exit 1;
  }
fi
if [ -n "$GENESIS_PRODUCTION_BASE" ]; then
  git cat-file -e "${GENESIS_PRODUCTION_BASE}^{commit}" 2>/dev/null \
    || { echo "[错误] 本地仓库缺少 production genesis baseline 提交"; exit 1; }
  [ "$GENESIS_PRODUCTION_BASE" != "$SOURCE_SHA" ] \
    || { echo "[错误] genesis baseline 不能等于候选提交"; exit 1; }
  [ "$(git rev-list --max-parents=0 "$SOURCE_SHA" | wc -l | tr -d ' ')" = "1" ] \
    || { echo "[错误] genesis 候选历史必须只有一个根提交"; exit 1; }
  [ -z "$(git rev-list --min-parents=2 "$SOURCE_SHA")" ] \
    || { echo "[错误] genesis 候选历史必须保持线性"; exit 1; }
fi

TMP_DIR="$(mktemp -d)"
if [ "$PRINT_COMMAND_ONLY" = "0" ]; then
  prepare_server_read_key
fi

if [ "$PRINT_COMMAND_ONLY" = "0" ] && [ -z "$BOOTSTRAP_PRODUCTION_BASE" ]; then
  echo "==> 部署前读取生产 canonical 回执与恢复状态..."
  production_state="$(ssh -i "$SERVER_READ_KEY" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "$SERVER" \
    "if [ -e '$REMOTE_DIR/.workspace/maintenance-deploy' ]; then printf 'maintenance:'; sed -n 's/^sourceSha=//p' '$REMOTE_DIR/.workspace/maintenance-deploy'; elif [ -e '$REMOTE_DIR/.workspace/production-bootstrap-in-progress.json' ]; then printf bootstrap; elif [ -f '$REMOTE_DIR/.workspace/deployed-release.json' ]; then printf ready; else printf missing; fi")"
  case "$production_state" in
    ready) ;;
    "maintenance:$SOURCE_SHA")
      echo "==> 检测到当前 candidate 的 maintenance-deploy marker；进入同源恢复部署"
      ;;
    maintenance:*)
      echo "[错误] 生产存在未完成 maintenance-deploy marker；先恢复同一 candidate，拒绝启动新的 full 部署"
      exit 1
      ;;
    bootstrap)
      echo "[错误] 生产存在未完成 production bootstrap marker；先恢复同一 candidate，拒绝启动新的 full 部署"
      exit 1
      ;;
    missing)
      echo "[错误] 生产缺少正式 deployed-release 回执；首次接管必须使用 audited production bootstrap"
      exit 1
      ;;
    *)
      echo "[错误] 无法识别生产部署状态: ${production_state:-<empty>}"
      exit 1
      ;;
  esac

  PRODUCTION_RECEIPT_FILE="$TMP_DIR/deployed-release.json"
  PREFLIGHT_RESULT_FILE="$TMP_DIR/production-preflight.json"
  ssh -i "$SERVER_READ_KEY" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "$SERVER" \
    "cat '$REMOTE_DIR/.workspace/deployed-release.json'" > "$PRODUCTION_RECEIPT_FILE"
  preflight_args=(
    --cwd "$SOURCE_DIR"
    --receipt "$PRODUCTION_RECEIPT_FILE"
    --candidate "$SOURCE_SHA"
    --candidate-tree "$SOURCE_TREE"
    --expected-repository "$CNB_REPO"
  )
  [ -z "$GENESIS_PRODUCTION_BASE" ] || preflight_args+=(--genesis-from "$GENESIS_PRODUCTION_BASE")
  node ops/production-deploy-preflight.mjs "${preflight_args[@]}" > "$PREFLIGHT_RESULT_FILE"
  node -e '
    const result = require(process.argv[1]);
    const migrations = result.migration.changedMigrations.length;
    const mode = result.migration.requiresMaintenance ? "maintenance" : "expand/none";
    console.log(`==> 生产预检通过: deployed ${result.production.deployedSha.slice(0, 12)} -> candidate ${result.candidate.commitSha.slice(0, 12)}; migrations ${migrations} (${mode})`);
  ' "$PREFLIGHT_RESULT_FILE"
fi

LOCAL_PREFLIGHT_DURATION_SECONDS="$(($(date +%s) - LOCAL_PREFLIGHT_STARTED_EPOCH_SECONDS))"

echo "==> 已复用当前 tree 的本地 prepare 回执；deploy 不运行编译或测试。"

if [ "$PRINT_COMMAND_ONLY" = "0" ]; then
  echo "==> 同步并校验本次部署使用的租户配置..."
  TENANT_SYNC_STARTED_EPOCH_SECONDS="$(date +%s)"
  OPS_ENV_FILE="$OPS_ENV_FILE" "$SCRIPT_DIR/sync-tenant-config.sh" --source-sha "$SOURCE_SHA"
  TENANT_SYNC_DURATION_SECONDS="$(($(date +%s) - TENANT_SYNC_STARTED_EPOCH_SECONDS))"
fi

release_process_snapshot="$(node "$SCRIPT_DIR/release-process-timing.mjs" snapshot --file "$RELEASE_PROCESS_TIMING_FILE")"
RELEASE_PROCESS_SECONDS="$(node -e 'process.stdout.write(String(JSON.parse(process.argv[1]).releaseProcessSeconds))' "$release_process_snapshot")"
RELEASE_ATTEMPT_COUNT="$(node -e 'process.stdout.write(String(JSON.parse(process.argv[1]).releaseAttemptCount))' "$release_process_snapshot")"
RELEASE_PROCESS_STARTED_AT="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).releaseProcessStartedAt)' "$release_process_snapshot")"
echo "==> release 流程准备完成：累计 $(format_duration "$RELEASE_PROCESS_SECONDS")，${RELEASE_ATTEMPT_COUNT} 次尝试（main 处理与 CI 已排除）"

METADATA_FILE="$TMP_DIR/cnb-release.json"
RESULT_FILE="$TMP_DIR/cnb-trigger.json"
BASELINE_MIGRATION_COUNT=""
BASELINE_MIGRATION_DIGEST=""
GENESIS_LEGACY_MIGRATION_COUNT=""
GENESIS_LEGACY_MIGRATION_DIGEST=""
GENESIS_BASELINE_MIGRATION=""
GENESIS_BASELINE_CHECKSUM=""
if [ -n "$BOOTSTRAP_PRODUCTION_BASE" ]; then
  baseline_values="$(BASELINE_SHA="$BOOTSTRAP_PRODUCTION_BASE" node <<'NODE'
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const baseline = process.env.BASELINE_SHA;
const files = execFileSync('git', ['ls-tree', '-r', '--name-only', baseline, '--', 'prisma/migrations'], { encoding: 'utf8' })
  .split('\n')
  .filter((file) => /^prisma\/migrations\/[0-9]{14}_[a-z0-9_]+\/migration\.sql$/.test(file))
  .sort();
if (files.length === 0) throw new Error('bootstrap baseline has no active migrations');
const rows = files.map((file) => {
  const body = execFileSync('git', ['show', `${baseline}:${file}`]);
  return `${file.split('/')[2]}\t${createHash('sha256').update(body).digest('hex')}\n`;
});
process.stdout.write(`${files.length}\n${createHash('sha256').update(rows.join('')).digest('hex')}\n`);
NODE
)"
  BASELINE_MIGRATION_COUNT="$(printf '%s\n' "$baseline_values" | sed -n '1p')"
  BASELINE_MIGRATION_DIGEST="$(printf '%s\n' "$baseline_values" | sed -n '2p')"
fi
if [ -n "$GENESIS_PRODUCTION_BASE" ]; then
  genesis_legacy_values="$(BASELINE_SHA="$GENESIS_PRODUCTION_BASE" node <<'NODE'
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const baseline = process.env.BASELINE_SHA;
const files = execFileSync('git', ['ls-tree', '-r', '--name-only', baseline, '--', 'prisma/migrations'], { encoding: 'utf8' })
  .split('\n')
  .filter((file) => /^prisma\/migrations\/[0-9]{14}_[a-z0-9_]+\/migration\.sql$/.test(file))
  .sort();
if (files.length === 0) throw new Error('genesis production baseline has no active migrations');
const rows = files.map((file) => {
  const body = execFileSync('git', ['show', `${baseline}:${file}`]);
  return `${file.split('/')[2]}\t${createHash('sha256').update(body).digest('hex')}\n`;
});
process.stdout.write(`${files.length}\n${createHash('sha256').update(rows.join('')).digest('hex')}\n`);
NODE
)"
  GENESIS_LEGACY_MIGRATION_COUNT="$(printf '%s\n' "$genesis_legacy_values" | sed -n '1p')"
  GENESIS_LEGACY_MIGRATION_DIGEST="$(printf '%s\n' "$genesis_legacy_values" | sed -n '2p')"
  genesis_baseline_values="$(node <<'NODE'
const { createHash } = require('node:crypto');
const { readFileSync, readdirSync } = require('node:fs');
const entries = readdirSync('prisma/migrations', { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
if (entries.length !== 1 || entries[0] !== '00000000000000_sanitized_baseline') {
  throw new Error('genesis candidate must contain exactly 00000000000000_sanitized_baseline');
}
const body = readFileSync(`prisma/migrations/${entries[0]}/migration.sql`);
process.stdout.write(`${entries[0]}\n${createHash('sha256').update(body).digest('hex')}\n`);
NODE
)"
  GENESIS_BASELINE_MIGRATION="$(printf '%s\n' "$genesis_baseline_values" | sed -n '1p')"
  GENESIS_BASELINE_CHECKSUM="$(printf '%s\n' "$genesis_baseline_values" | sed -n '2p')"
fi

SOURCE_SHA="$SOURCE_SHA" SOURCE_TREE="$SOURCE_TREE" CNB_REPO="$CNB_REPO" RELEASE_BRANCH="$RELEASE_BRANCH" \
BOOTSTRAP_PRODUCTION_BASE="$BOOTSTRAP_PRODUCTION_BASE" BOOTSTRAP_LEGACY_CNB_COMMIT="$BOOTSTRAP_LEGACY_CNB_COMMIT" \
BOOTSTRAP_LEGACY_RELEASE_ID="$BOOTSTRAP_LEGACY_RELEASE_ID" BOOTSTRAP_LEGACY_CNB_BUILD_SN="$BOOTSTRAP_LEGACY_CNB_BUILD_SN" \
BOOTSTRAP_LEGACY_RUNTIME_VERSION="$BOOTSTRAP_LEGACY_RUNTIME_VERSION" BOOTSTRAP_LEGACY_BUILD_ID="$BOOTSTRAP_LEGACY_BUILD_ID" \
BASELINE_MIGRATION_COUNT="$BASELINE_MIGRATION_COUNT" BASELINE_MIGRATION_DIGEST="$BASELINE_MIGRATION_DIGEST" \
GENESIS_PRODUCTION_BASE="$GENESIS_PRODUCTION_BASE" GENESIS_LEGACY_MIGRATION_COUNT="$GENESIS_LEGACY_MIGRATION_COUNT" \
GENESIS_LEGACY_MIGRATION_DIGEST="$GENESIS_LEGACY_MIGRATION_DIGEST" GENESIS_BASELINE_MIGRATION="$GENESIS_BASELINE_MIGRATION" \
GENESIS_BASELINE_CHECKSUM="$GENESIS_BASELINE_CHECKSUM" \
LOCAL_RELEASE_GATE_RECEIPT_FILE="$LOCAL_RELEASE_GATE_RECEIPT_FILE" METADATA_FILE="$METADATA_FILE" \
PUBLISH_STARTED_EPOCH_SECONDS="$PUBLISH_STARTED_EPOCH_SECONDS" DEPLOY_UNIT_ID="$DEPLOY_UNIT_ID" DEPLOY_UNIT_MODE="$DEPLOY_UNIT_MODE" \
RELEASE_PROCESS_SECONDS="$RELEASE_PROCESS_SECONDS" RELEASE_ATTEMPT_COUNT="$RELEASE_ATTEMPT_COUNT" \
RELEASE_PROCESS_STARTED_AT="$RELEASE_PROCESS_STARTED_AT" TENANT_SYNC_DURATION_SECONDS="$TENANT_SYNC_DURATION_SECONDS" node <<'NODE'
const fs = require('node:fs');
const localReleaseGate = JSON.parse(fs.readFileSync(process.env.LOCAL_RELEASE_GATE_RECEIPT_FILE, 'utf8'));
const startedAtEpochSeconds = Number(process.env.PUBLISH_STARTED_EPOCH_SECONDS);
if (!Number.isSafeInteger(startedAtEpochSeconds) || startedAtEpochSeconds <= 0) {
  throw new Error('publish start epoch is invalid');
}
const seconds = (name) => {
  const value = Number(process.env[name]);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} is invalid`);
  return value;
};
const releaseAttemptCount = seconds('RELEASE_ATTEMPT_COUNT');
if (releaseAttemptCount < 1) throw new Error('RELEASE_ATTEMPT_COUNT is invalid');
if (Number.isNaN(Date.parse(process.env.RELEASE_PROCESS_STARTED_AT))) throw new Error('RELEASE_PROCESS_STARTED_AT is invalid');
const metadata = {
  schemaVersion: 1,
  source: { commitSha: process.env.SOURCE_SHA, treeSha: process.env.SOURCE_TREE },
  localReleaseGate,
  cnb: { repository: process.env.CNB_REPO, sourceBranch: process.env.RELEASE_BRANCH },
  deployment: {
    startedAtEpochSeconds,
    localTiming: {
      releaseProcessSeconds: seconds('RELEASE_PROCESS_SECONDS'),
      releaseAttemptCount,
      releaseProcessStartedAt: process.env.RELEASE_PROCESS_STARTED_AT,
      tenantSyncSeconds: seconds('TENANT_SYNC_DURATION_SECONDS'),
    },
    target: process.env.DEPLOY_UNIT_ID
      ? { kind: 'unit', unitId: process.env.DEPLOY_UNIT_ID, mode: process.env.DEPLOY_UNIT_MODE }
      : { kind: 'monolith' },
  },
};
if (process.env.BOOTSTRAP_PRODUCTION_BASE) {
  metadata.deploymentBootstrap = {
    baselineSha: process.env.BOOTSTRAP_PRODUCTION_BASE,
    legacy: {
      cnbCommitSha: process.env.BOOTSTRAP_LEGACY_CNB_COMMIT,
      releaseId: process.env.BOOTSTRAP_LEGACY_RELEASE_ID,
      cnbBuildSn: process.env.BOOTSTRAP_LEGACY_CNB_BUILD_SN,
      runtimeVersion: process.env.BOOTSTRAP_LEGACY_RUNTIME_VERSION,
      buildId: process.env.BOOTSTRAP_LEGACY_BUILD_ID,
      cnbRepository: process.env.CNB_REPO,
    },
    database: {
      migrationCount: Number(process.env.BASELINE_MIGRATION_COUNT),
      migrationSetSha256: process.env.BASELINE_MIGRATION_DIGEST,
    },
  };
}
if (process.env.GENESIS_PRODUCTION_BASE) {
  metadata.deploymentGenesis = {
    fromSourceSha: process.env.GENESIS_PRODUCTION_BASE,
    legacyMigrationCount: Number(process.env.GENESIS_LEGACY_MIGRATION_COUNT),
    legacyMigrationSetSha256: process.env.GENESIS_LEGACY_MIGRATION_DIGEST,
    baselineMigration: process.env.GENESIS_BASELINE_MIGRATION,
    baselineChecksum: process.env.GENESIS_BASELINE_CHECKSUM,
  };
}
fs.writeFileSync(process.env.METADATA_FILE, `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 });
NODE

release_args=(--metadata "$METADATA_FILE" --result-file "$RESULT_FILE")
[ "$PRINT_COMMAND_ONLY" = "0" ] || release_args+=(--print-command)
if [ "$PRINT_COMMAND_ONLY" = "0" ]; then
  echo "==> 正式部署计时开始: $PUBLISH_STARTED_AT"
fi
RELEASE_TRIGGER_STARTED_EPOCH_SECONDS="$(date +%s)"
env -u CNB_TOKEN OPS_ENV_FILE="$OPS_ENV_FILE" "$SCRIPT_DIR/release-to-cnb.sh" "${release_args[@]}"
RELEASE_TRIGGER_DURATION_SECONDS="$(($(date +%s) - RELEASE_TRIGGER_STARTED_EPOCH_SECONDS))"
[ "$PRINT_COMMAND_ONLY" = "0" ] || exit 0

CNB_SN="$(node -e 'const r=require(process.argv[1]); process.stdout.write(r.sn);' "$RESULT_FILE")"
echo "==> 等待 CNB $CNB_SN 与生产版本 ${SOURCE_SHA:0:12}（最长 ${DEPLOY_WAIT_SECONDS}s）..."

deadline=$(( $(date +%s) + DEPLOY_WAIT_SECONDS ))
while [ "$(date +%s)" -le "$deadline" ]; do
  cnb_state="unknown"
  status_file="$TMP_DIR/cnb-status.json"
  if env -u CNB_TOKEN cnb build get-build-status --repo "$CNB_REPO" --sn "$CNB_SN" --verbose > "$status_file" 2>/dev/null; then
    cnb_state="$(node scripts/ci/cnb-build-state.mjs classify-status --input "$status_file" 2>/dev/null || true)"
    [ "$cnb_state" != "failure" ] || { echo "[错误] CNB build $CNB_SN 已终止失败"; exit 1; }
  fi
  if [ -n "$DEPLOY_UNIT_ID" ]; then
    if [ "$DEPLOY_UNIT_MODE" = "activate" ]; then
      unit_ready="$(ssh -i "$SERVER_READ_KEY" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "$SERVER" \
        "STATE_FILE='$REMOTE_DIR/.workspace/gateway/current/unit-states/$DEPLOY_UNIT_ID.json' EXPECTED_UNIT='$DEPLOY_UNIT_ID' EXPECTED_SHA='$SOURCE_SHA' EXPECTED_TREE='$SOURCE_TREE' node - <<'NODE'
const fs = require('node:fs');
const state = JSON.parse(fs.readFileSync(process.env.STATE_FILE, 'utf8'));
if (state.unitId !== process.env.EXPECTED_UNIT || !state.active?.releaseDir) process.exit(1);
const manifest = JSON.parse(fs.readFileSync(state.active.releaseDir + '/artifact.manifest.json', 'utf8'));
if (manifest.source?.commitSha !== process.env.EXPECTED_SHA || manifest.source?.treeSha !== process.env.EXPECTED_TREE) process.exit(1);
process.stdout.write('ready');
NODE" 2>/dev/null || true)"
    else
      unit_ready="$(ssh -i "$SERVER_READ_KEY" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "$SERVER" \
        "for receipt in '$REMOTE_DIR/deploy-units/$DEPLOY_UNIT_ID/receipts/'*.json; do
           [ -f \"\$receipt\" ] || continue
           if node '$REMOTE_DIR/.workspace/runtime/deploy-unit-tools/deploy-unit-release.mjs' receipt-source-assert --receipt \"\$receipt\" --source-sha '$SOURCE_SHA' --source-tree '$SOURCE_TREE' >/dev/null 2>&1; then
             printf ready
             exit 0
           fi
         done" 2>/dev/null || true)"
    fi
    if [ "$unit_ready" = "ready" ] && [ "$cnb_state" = "success" ]; then
      echo "==> CNB-native 单模块 ${DEPLOY_UNIT_MODE} 部署完成: $DEPLOY_UNIT_ID $SOURCE_SHA ($CNB_SN)"
      FORMAL_DEPLOY_FINISHED_EPOCH="$(date +%s)"
      FORMAL_DEPLOY_FINISHED_AT="$(date '+%Y-%m-%d %H:%M:%S %z')"
      FORMAL_DEPLOY_DURATION="$((FORMAL_DEPLOY_FINISHED_EPOCH - PUBLISH_STARTED_EPOCH_SECONDS))"
      echo "==> 正式部署计时结束: $FORMAL_DEPLOY_FINISHED_AT"
      print_deploy_timing_summary "$FORMAL_DEPLOY_DURATION" "$status_file"
      complete_release_process_session
      exit 0
    fi
    sleep 10
    continue
  fi
  deployed_values="$(ssh -i "$SERVER_READ_KEY" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "$SERVER" \
    "python3 -c \"import json; from pathlib import Path; p=Path('$REMOTE_DIR/.workspace/deployed-release.json'); r=json.loads(p.read_text()) if p.exists() else {}; print(r.get('source', {}).get('commitSha', '')); print(r.get('deployment', {}).get('releaseId', ''))\"" 2>/dev/null || true)"
  deployed_sha="$(printf '%s\n' "$deployed_values" | sed -n '1p')"
  deployed_release_id="$(printf '%s\n' "$deployed_values" | sed -n '2p')"
  if [ "$deployed_sha" = "$SOURCE_SHA" ] && [ "$cnb_state" = "success" ]; then
    ssh -i "$SERVER_READ_KEY" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "$SERVER" \
      "set -e; curl -fsS '$HEALTHCHECK_URL' >/dev/null; test \"\$(curl -fsS http://127.0.0.1:3000/workspace/api/settings/version | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>process.stdout.write(JSON.parse(s).version))')\" = '$SOURCE_SHA'"
    FORMAL_DEPLOY_FINISHED_EPOCH="$(date +%s)"
    FORMAL_DEPLOY_FINISHED_AT="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    FORMAL_DEPLOY_DURATION="$((FORMAL_DEPLOY_FINISHED_EPOCH - PUBLISH_STARTED_EPOCH_SECONDS))"
    record_final_full_deploy_event "$FORMAL_DEPLOY_DURATION" "$FORMAL_DEPLOY_FINISHED_AT" "$status_file" "$deployed_release_id"
    echo "==> CNB-native 生产部署完成: $SOURCE_SHA ($CNB_SN)"
    echo "==> 正式部署计时结束: $FORMAL_DEPLOY_FINISHED_AT"
    print_deploy_timing_summary "$FORMAL_DEPLOY_DURATION" "$status_file"
    complete_release_process_session
    exit 0
  fi
  sleep 10
done

echo "[错误] 等待 CNB/生产部署超时: $CNB_SN${DEPLOY_UNIT_ID:+ ($DEPLOY_UNIT_ID $DEPLOY_UNIT_MODE)}"
exit 1
