#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPS_ENV_FILE="${OPS_ENV_FILE:-$SCRIPT_DIR/.env}"
# shellcheck source=/dev/null
source "$OPS_ENV_FILE"

: "${SOURCE_DIR:?SOURCE_DIR not set in $OPS_ENV_FILE}"
: "${RELEASE_BRANCH:?RELEASE_BRANCH not set in $OPS_ENV_FILE}"

MODE=""
PRINT_COMMAND_ONLY=0
FORCE_FULL=0
BOOTSTRAP_PRODUCTION_BASE=""
BOOTSTRAP_LEGACY_CNB_COMMIT=""
BOOTSTRAP_LEGACY_RELEASE_ID=""
BOOTSTRAP_LEGACY_CNB_BUILD_SN=""
BOOTSTRAP_LEGACY_RUNTIME_VERSION=""
BOOTSTRAP_LEGACY_BUILD_ID=""
GITHUB_REMOTE_NAME="${GITHUB_REMOTE:-origin}"
GITHUB_HTTPS_PROXY="${GITHUB_HTTPS_PROXY-http://127.0.0.1:7897}"
TMP_DIR=""
TMP_KEY=""
GITHUB_DEPLOYMENT_ID=""
GITHUB_DEPLOYMENT_FINISHED=0
PRODUCTION_CONFIRMED=0
CNB_TRIGGER_STARTED=0
CNB_RESULT_FILE=""
CNB_SN=""
DEPLOY_WAIT_SECONDS="${DEPLOY_WAIT_SECONDS:-1800}"
PROMOTION_WAIT_SECONDS="${PROMOTION_WAIT_SECONDS:-600}"

with_github_proxy() {
  if [ -n "$GITHUB_HTTPS_PROXY" ]; then
    HTTPS_PROXY="$GITHUB_HTTPS_PROXY" "$@"
  else
    "$@"
  fi
}

usage() {
  cat <<'EOF'
用法:
  OPS_ENV_FILE=/path/to/ops/.env publish.sh push
  OPS_ENV_FILE=/path/to/ops/.env publish.sh deploy [选项]

模式:
  push     对当前提交跑自适应本地 gate；GitHub bot 创建候选 PR，避免 CODEOWNER 自审死锁
  deploy   只发布 GitHub 受保护 main 的已验证同 SHA 产物；不推源码、不重建

deploy 选项:
  --force-full       无论累计风险如何，都先触发一次指定 SHA 的全量 CI
  --bootstrap-production-base SHA
                     仅 deployed-release 缺失时接管现有生产；绑定旧运行态 receipt，并强制 fresh C3/full
  --bootstrap-legacy-cnb-commit SHA
  --bootstrap-legacy-release-id ID
  --bootstrap-legacy-cnb-build-sn SN
  --bootstrap-legacy-runtime-version VERSION
  --bootstrap-legacy-build-id BUILD_ID
                     五项共同绑定旧 CNB injection、服务器 current/PM2/runtime/BUILD_ID 与已成功历史 build
  --print-command    生成证据并更新 CNB release ref，但只打印 start-build 命令
  -h, --help         显示帮助

说明:
  push 不再直推 main 或 CNB；临时 staging 只供受信任 main workflow 复制，PR 由 bot 创建。
  deploy 比较“生产上次部署 SHA..当前 main SHA”的累计风险；证据不足时自动升级为全量。
EOF
}

cleanup() {
  local exit_code=$?
  if [ "$CNB_TRIGGER_STARTED" = "1" ] \
    && [ -n "$GITHUB_DEPLOYMENT_ID" ] \
    && [ "$GITHUB_DEPLOYMENT_FINISHED" != "1" ] \
    && [ "$PRODUCTION_CONFIRMED" != "1" ] \
    && [ -n "$CNB_SN" ]; then
    cnb_cleanup_state="$(query_cnb_state 2>/dev/null || true)"
    if [ "$cnb_cleanup_state" = "failure" ]; then
      with_github_proxy node scripts/ci/production-deployment.mjs status \
        --repository "$github_repository" \
        --deployment-id "$GITHUB_DEPLOYMENT_ID" \
        --state failure \
        --description "CNB reported a terminal production build failure" >/dev/null 2>&1 || true
      GITHUB_DEPLOYMENT_FINISHED=1
    fi
  fi
  if [ -n "$GITHUB_DEPLOYMENT_ID" ] \
    && [ "$GITHUB_DEPLOYMENT_FINISHED" != "1" ] \
    && [ "$PRODUCTION_CONFIRMED" != "1" ] \
    && [ "$CNB_TRIGGER_STARTED" != "1" ] \
    && [ "$PRINT_COMMAND_ONLY" != "1" ]; then
    with_github_proxy node scripts/ci/production-deployment.mjs status \
      --repository "$github_repository" \
      --deployment-id "$GITHUB_DEPLOYMENT_ID" \
      --state failure \
      --description "Production deployment did not complete" >/dev/null 2>&1 || true
  fi
  rm -rf "${TMP_DIR:-}"
  rm -f "${TMP_KEY:-}"
  return "$exit_code"
}
trap cleanup EXIT

while [ "$#" -gt 0 ]; do
  case "$1" in
    push|deploy)
      if [ -n "$MODE" ]; then
        echo "[错误] 只能指定一个模式: push 或 deploy"
        exit 1
      fi
      MODE="$1"
      ;;
    --force-full) FORCE_FULL=1 ;;
    --bootstrap-production-base)
      shift
      if [ "$#" -eq 0 ]; then
        echo "[错误] --bootstrap-production-base 缺少 40 位 Git SHA"
        exit 1
      fi
      BOOTSTRAP_PRODUCTION_BASE="$1"
      ;;
    --bootstrap-legacy-cnb-commit)
      shift; [ "$#" -gt 0 ] || { echo "[错误] --bootstrap-legacy-cnb-commit 缺少 SHA"; exit 1; }
      BOOTSTRAP_LEGACY_CNB_COMMIT="$1"
      ;;
    --bootstrap-legacy-release-id)
      shift; [ "$#" -gt 0 ] || { echo "[错误] --bootstrap-legacy-release-id 缺少 ID"; exit 1; }
      BOOTSTRAP_LEGACY_RELEASE_ID="$1"
      ;;
    --bootstrap-legacy-cnb-build-sn)
      shift; [ "$#" -gt 0 ] || { echo "[错误] --bootstrap-legacy-cnb-build-sn 缺少 SN"; exit 1; }
      BOOTSTRAP_LEGACY_CNB_BUILD_SN="$1"
      ;;
    --bootstrap-legacy-runtime-version)
      shift; [ "$#" -gt 0 ] || { echo "[错误] --bootstrap-legacy-runtime-version 缺少 VERSION"; exit 1; }
      BOOTSTRAP_LEGACY_RUNTIME_VERSION="$1"
      ;;
    --bootstrap-legacy-build-id)
      shift; [ "$#" -gt 0 ] || { echo "[错误] --bootstrap-legacy-build-id 缺少 BUILD_ID"; exit 1; }
      BOOTSTRAP_LEGACY_BUILD_ID="$1"
      ;;
    --print-command) PRINT_COMMAND_ONLY=1 ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[错误] 未知参数: $1"
      usage
      exit 1
      ;;
  esac
  shift
done

if [ -z "$MODE" ]; then
  echo "[错误] 请指定模式: push 或 deploy"
  usage
  exit 1
fi
if [ "$MODE" = "push" ] && { [ "$FORCE_FULL" = "1" ] || [ "$PRINT_COMMAND_ONLY" = "1" ] || [ -n "$BOOTSTRAP_PRODUCTION_BASE" ]; }; then
  echo "[错误] --force-full/--print-command/--bootstrap-production-base 只适用于 deploy"
  exit 1
fi
if [ -n "$BOOTSTRAP_PRODUCTION_BASE" ] && ! printf '%s' "$BOOTSTRAP_PRODUCTION_BASE" | grep -Eq '^[0-9a-f]{40}$'; then
  echo "[错误] --bootstrap-production-base 必须是 40 位小写 Git SHA"
  exit 1
fi
bootstrap_legacy_count=0
for value in "$BOOTSTRAP_LEGACY_CNB_COMMIT" "$BOOTSTRAP_LEGACY_RELEASE_ID" "$BOOTSTRAP_LEGACY_CNB_BUILD_SN" "$BOOTSTRAP_LEGACY_RUNTIME_VERSION" "$BOOTSTRAP_LEGACY_BUILD_ID"; do
  if [ -n "$value" ]; then bootstrap_legacy_count=$((bootstrap_legacy_count + 1)); fi
done
if [ -n "$BOOTSTRAP_PRODUCTION_BASE" ] && [ "$bootstrap_legacy_count" != "5" ]; then
  echo "[错误] production bootstrap 必须同时提供 legacy CNB commit、release id、build SN、runtime version 和 BUILD_ID"
  exit 1
fi
if [ -z "$BOOTSTRAP_PRODUCTION_BASE" ] && [ "$bootstrap_legacy_count" != "0" ]; then
  echo "[错误] legacy bootstrap 参数只能与 --bootstrap-production-base 同时使用"
  exit 1
fi
if [ -n "$BOOTSTRAP_PRODUCTION_BASE" ] && [ "$PRINT_COMMAND_ONLY" = "1" ]; then
  echo "[错误] production bootstrap 禁止 --print-command；接管必须原子触发并等待正式部署记录"
  exit 1
fi
if [ -n "$BOOTSTRAP_LEGACY_CNB_COMMIT" ] && ! printf '%s' "$BOOTSTRAP_LEGACY_CNB_COMMIT" | grep -Eq '^[0-9a-f]{40}$'; then
  echo "[错误] --bootstrap-legacy-cnb-commit 必须是 40 位小写 Git SHA"
  exit 1
fi
if [ -n "$BOOTSTRAP_LEGACY_RELEASE_ID" ] && ! printf '%s' "$BOOTSTRAP_LEGACY_RELEASE_ID" | grep -Eq '^[0-9]{14}-[0-9a-f]{8}$'; then
  echo "[错误] --bootstrap-legacy-release-id 格式无效"
  exit 1
fi
if [ -n "$BOOTSTRAP_LEGACY_CNB_BUILD_SN" ] && ! printf '%s' "$BOOTSTRAP_LEGACY_CNB_BUILD_SN" | grep -Eq '^cnb-[a-z0-9]+(-[a-z0-9]+)*$'; then
  echo "[错误] --bootstrap-legacy-cnb-build-sn 格式无效"
  exit 1
fi
if [ -n "$BOOTSTRAP_LEGACY_RUNTIME_VERSION" ] && ! printf '%s' "$BOOTSTRAP_LEGACY_RUNTIME_VERSION" | grep -Eq '^local-[0-9]{8,}$'; then
  echo "[错误] --bootstrap-legacy-runtime-version 格式无效"
  exit 1
fi
if [ -n "$BOOTSTRAP_LEGACY_BUILD_ID" ] && ! printf '%s' "$BOOTSTRAP_LEGACY_BUILD_ID" | grep -Eq '^local-[0-9]{8,}$'; then
  echo "[错误] --bootstrap-legacy-build-id 格式无效"
  exit 1
fi
if [ "$MODE" = "push" ]; then
  case "$PROMOTION_WAIT_SECONDS" in
    ''|*[!0-9]*) echo "[错误] PROMOTION_WAIT_SECONDS 必须是正整数"; exit 1 ;;
  esac
  if [ "$PROMOTION_WAIT_SECONDS" -lt 1 ]; then
    echo "[错误] PROMOTION_WAIT_SECONDS 必须至少为 1"
    exit 1
  fi
fi
if [ "$MODE" = "deploy" ]; then
  case "$DEPLOY_WAIT_SECONDS" in
    ''|*[!0-9]*) echo "[错误] DEPLOY_WAIT_SECONDS 必须是正整数"; exit 1 ;;
  esac
  if [ "$DEPLOY_WAIT_SECONDS" -lt 1 ]; then
    echo "[错误] DEPLOY_WAIT_SECONDS 必须至少为 1"
    exit 1
  fi
fi

cd "$SOURCE_DIR"

dirty_status="$(git status --short)"
if [ -n "$dirty_status" ]; then
  echo "[错误] 工作区存在未提交改动，请先提交或清理："
  echo "$dirty_status"
  exit 1
fi

command -v gh >/dev/null 2>&1 || {
  echo "[错误] 未找到 gh CLI；push/deploy 都需要 GitHub 的 PR、CI 与产物证据"
  exit 1
}

echo "==> 拉取 GitHub $RELEASE_BRANCH..."
with_github_proxy git fetch "$GITHUB_REMOTE_NAME" "$RELEASE_BRANCH"
remote_main_sha="$(git rev-parse "$GITHUB_REMOTE_NAME/$RELEASE_BRANCH")"
head_sha="$(git rev-parse HEAD)"
head_tree="$(git rev-parse 'HEAD^{tree}')"
github_repository="${GITHUB_REPOSITORY:-$(with_github_proxy gh repo view --json nameWithOwner --jq .nameWithOwner)}"

if [ "$MODE" = "push" ]; then
  if ! git merge-base --is-ancestor "$remote_main_sha" "$head_sha"; then
    echo "[错误] 当前提交不是 GitHub $RELEASE_BRANCH 的快进候选；请先同步主分支"
    exit 1
  fi

  staging_branch="codex/staging-main"
  candidate_branch="codex/candidate-main"
  staging_before="$(with_github_proxy git ls-remote --heads "$GITHUB_REMOTE_NAME" "refs/heads/$staging_branch" | awk '{print $1}')"
  echo "==> 运行候选提交的自适应本地 gate 并更新稳定 staging ref $staging_branch..."
  WORKSPACE_DIFF_BASE="$remote_main_sha" \
  WORKSPACE_DIFF_HEAD="$head_sha" \
    with_github_proxy git push "$GITHUB_REMOTE_NAME" \
      --force-with-lease="refs/heads/$staging_branch:$staging_before" \
      "HEAD:refs/heads/$staging_branch"

  minimum_promotion_run_id="$(with_github_proxy gh api \
    "repos/${github_repository}/actions/workflows/promote-candidate.yml/runs?branch=${RELEASE_BRANCH}&event=workflow_dispatch&per_page=100" \
    --jq '[.workflow_runs[].id] | max // 0')"
  with_github_proxy gh workflow run promote-candidate.yml \
    --repo "$github_repository" \
    --ref "$RELEASE_BRANCH" \
    -f staging_branch="$staging_branch" \
    -f staging_sha="$head_sha" \
    -f base_sha="$remote_main_sha"

  echo "==> 等待受信任 main workflow 创建 bot PR 并显式触发 candidate CI..."
  promotion_deadline=$(( $(date +%s) + PROMOTION_WAIT_SECONDS ))
  promotion_run_id=""
  while [ "$(date +%s)" -le "$promotion_deadline" ]; do
    promotion_run_id="$(with_github_proxy gh api \
      "repos/${github_repository}/actions/workflows/promote-candidate.yml/runs?branch=${RELEASE_BRANCH}&event=workflow_dispatch&per_page=100" \
      --jq "[.workflow_runs[] | select(.id > $minimum_promotion_run_id and .head_sha == \"$remote_main_sha\")] | sort_by(.id) | last | .id // empty")"
    if [ -n "$promotion_run_id" ]; then break; fi
    sleep 2
  done
  if [ -z "$promotion_run_id" ]; then
    echo "[错误] 等待 Promote candidate workflow 启动超时"
    exit 1
  fi
  with_github_proxy gh run watch "$promotion_run_id" --repo "$github_repository" --exit-status --interval 5
  pr_url="$(with_github_proxy gh pr view "$candidate_branch" --repo "$github_repository" --json url --jq .url)"
  echo "==> bot PR 已就绪: $pr_url"
  echo "==> push 完成：candidate CI 已触发；未推 CNB、未触发生产部署。"
  exit 0
fi

current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [ "$current_branch" != "$RELEASE_BRANCH" ]; then
  echo "[错误] deploy 只能从本地 $RELEASE_BRANCH 执行；当前分支是 $current_branch"
  exit 1
fi
if [ "$head_sha" != "$remote_main_sha" ]; then
  echo "[错误] 本地 HEAD 必须精确等于 GitHub 受保护 $RELEASE_BRANCH；禁止发布未合并或旧提交"
  exit 1
fi

TMP_DIR="$(mktemp -d)"
classification_file="$TMP_DIR/cumulative-classification.json"
migration_policy_file="$TMP_DIR/cumulative-migration-policy.json"
manifest_file="$TMP_DIR/workspace-standalone.manifest.json"
evidence_file="$TMP_DIR/release-evidence.json"
CNB_RESULT_FILE="$TMP_DIR/cnb-trigger.json"

query_cnb_state() {
  local status_file
  status_file="$TMP_DIR/cnb-status.json"
  if ! env -u CNB_TOKEN cnb build get-build-status \
    --repo "${CNB_REPO:?CNB_REPO not set in $OPS_ENV_FILE}" \
    --sn "$CNB_SN" \
    --verbose > "$status_file"; then
    return 1
  fi
  node scripts/ci/cnb-build-state.mjs classify-status --input "$status_file"
}

prepare_server_read_key() {
  SERVER_READ_KEY=""
  if [ -n "${KEY:-}" ] && [ -f "$KEY" ]; then
    SERVER_READ_KEY="$KEY"
  elif [ -n "${KEY_CONTENT:-}" ]; then
    if [ -z "$TMP_KEY" ]; then
      TMP_KEY="$(mktemp)"
      printf '%s\n' "$KEY_CONTENT" > "$TMP_KEY"
      chmod 600 "$TMP_KEY"
    fi
    SERVER_READ_KEY="$TMP_KEY"
  fi
}

verify_server_runtime() {
  local expected_sha="${1:-$head_sha}"
  if ! printf '%s' "$expected_sha" | grep -Eq '^[0-9a-f]{40}$'; then
    echo "[错误] 生产版本复验目标不是 40 位小写 Git SHA"
    return 1
  fi
  if [ -z "${SERVER:-}" ] || [ -z "${SERVER_READ_KEY:-}" ]; then
    echo "[错误] 无法通过 SSH 复验生产健康；请配置 SERVER 与 KEY/KEY_CONTENT"
    return 1
  fi
  case "${HEALTHCHECK_URL:-}" in
    http://*|https://*) ;;
    *) echo "[错误] HEALTHCHECK_URL 必须是服务器本机可访问的 http(s) 地址"; return 1 ;;
  esac
  case "$HEALTHCHECK_URL" in
    *"'"*) echo "[错误] HEALTHCHECK_URL 不能包含单引号"; return 1 ;;
  esac
  ssh -i "$SERVER_READ_KEY" \
    -o BatchMode=yes \
    -o ConnectTimeout=10 \
    -o StrictHostKeyChecking=accept-new \
    "$SERVER" \
    "set -e
curl -fsS '$HEALTHCHECK_URL' >/dev/null
version_response=\$(curl -fsS 'http://127.0.0.1:3000/workspace/api/settings/version')
VERSION_RESPONSE=\"\$version_response\" EXPECTED_VERSION='$expected_sha' node - <<'NODE'
const payload = JSON.parse(process.env.VERSION_RESPONSE || 'null');
if (!payload || payload.version !== process.env.EXPECTED_VERSION) {
  throw new Error('production version endpoint does not match protected main');
}
NODE"
}

verify_legacy_server_state() {
  local expected_release_id="$1"
  local expected_migration_count="$2"
  local expected_migration_digest="$3"
  local expected_runtime_version="$4"
  local expected_build_id="$5"
  local pm2_name="${PM2_NAME:-workspace}"
  local remote_config_dir="${REMOTE_WORKSPACE_CONFIG_DIR:-${REMOTE_DIR:-}/.workspace}"
  if [ -z "${SERVER:-}" ] || [ -z "${SERVER_READ_KEY:-}" ] || [ -z "${REMOTE_DIR:-}" ]; then
    echo "[错误] legacy production bootstrap 需要 SERVER、REMOTE_DIR 与 KEY/KEY_CONTENT"
    return 1
  fi
  case "${HEALTHCHECK_URL:-}" in
    http://*|https://*) ;;
    *) echo "[错误] HEALTHCHECK_URL 必须是服务器本机可访问的 http(s) 地址"; return 1 ;;
  esac
  ssh -i "$SERVER_READ_KEY" \
    -o BatchMode=yes \
    -o ConnectTimeout=10 \
    -o StrictHostKeyChecking=accept-new \
    "$SERVER" \
    "set -e
curl -fsS '$HEALTHCHECK_URL' >/dev/null
expected_target=\$(readlink -f '$REMOTE_DIR/releases/$expected_release_id')
current_target=\$(readlink -f '$REMOTE_DIR/current')
current_release=\$(basename \"\$current_target\")
if [ ! -d \"\$expected_target\" ] || [ \"\$current_target\" != \"\$expected_target\" ] || [ \"\$current_release\" != '$expected_release_id' ]; then
  echo '[错误] production current release 与 bootstrap receipt 不一致'
  exit 1
fi
if [ \"\$(cat \"\$current_target/workspace/.next/BUILD_ID\")\" != '$expected_build_id' ]; then
  echo '[错误] legacy filesystem BUILD_ID 与 bootstrap receipt 不一致'
  exit 1
fi
version_response=\$(curl -fsS 'http://127.0.0.1:3000/workspace/api/settings/version')
VERSION_RESPONSE=\"\$version_response\" EXPECTED_VERSION='$expected_runtime_version' node - <<'NODE'
const payload = JSON.parse(process.env.VERSION_RESPONSE || 'null');
if (!payload || payload.version !== process.env.EXPECTED_VERSION) {
  throw new Error('legacy runtime version does not match bootstrap receipt');
}
NODE
process_list=\$(pm2 jlist)
PROCESS_LIST=\"\$process_list\" PROCESS_NAME='$pm2_name' EXPECTED_TARGET=\"\$current_target\" node - <<'NODE'
const fs = require('fs');
const path = require('path');
const processes = JSON.parse(process.env.PROCESS_LIST || 'null');
const matches = Array.isArray(processes)
  ? processes.filter((item) => item?.name === process.env.PROCESS_NAME)
  : [];
if (matches.length !== 1 || matches[0]?.pm2_env?.status !== 'online') {
  throw new Error('legacy Workspace PM2 process is not uniquely online');
}
const target = fs.realpathSync(process.env.EXPECTED_TARGET);
for (const [label, value] of [['cwd', matches[0]?.pm2_env?.pm_cwd], ['exec', matches[0]?.pm2_env?.pm_exec_path]]) {
  if (typeof value !== 'string') throw new Error('legacy PM2 ' + label + ' is missing');
  const actual = fs.realpathSync(value);
  if (actual !== target && !actual.startsWith(target + path.sep)) {
    throw new Error('legacy PM2 ' + label + ' is outside the receipt release');
  }
}
NODE
set -a
. '$remote_config_dir/.env'
set +a
migration_rows=\$(psql \"\$DIRECT_URL\" -v ON_ERROR_STOP=1 -At -F '	' -c \"SELECT migration_name, checksum, CASE WHEN finished_at IS NOT NULL AND rolled_back_at IS NULL THEN '1' ELSE '0' END FROM \\\"_prisma_migrations\\\" ORDER BY migration_name, started_at\")
MIGRATION_ROWS=\"\$migration_rows\" EXPECTED_COUNT='$expected_migration_count' EXPECTED_DIGEST='$expected_migration_digest' node - <<'NODE'
const { createHash } = require('crypto');
const rows = (process.env.MIGRATION_ROWS || '').split('\n').filter(Boolean).map((line) => line.split('\t'));
if (rows.some((row) => row.length !== 3 || !/^[0-9]{14}_[a-z0-9_]+$/.test(row[0]) || !/^[0-9a-f]{64}$/.test(row[1]) || row[2] !== '1')) {
  throw new Error('production migration history contains invalid, incomplete, or rolled-back rows');
}
if (new Set(rows.map((row) => row[0])).size !== rows.length) {
  throw new Error('production migration history contains duplicate names');
}
rows.sort((left, right) => left[0].localeCompare(right[0]));
const canonical = rows.map((row) => row[0] + '\t' + row[1] + '\n').join('');
const digest = createHash('sha256').update(canonical).digest('hex');
if (rows.length !== Number(process.env.EXPECTED_COUNT) || digest !== process.env.EXPECTED_DIGEST) {
  throw new Error('production migration name/checksum set does not match bootstrap baseline');
}
NODE"
}

compute_candidate_migration_set_sha() {
  node <<'NODE'
const { createHash } = require('crypto');
const { readdirSync, readFileSync } = require('fs');
const { join, relative, sep } = require('path');
const root = process.cwd();
const migrationRoot = join(root, 'prisma', 'migrations');
const files = [];
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile()) files.push(file);
  }
}
walk(migrationRoot);
const hash = createHash('sha256');
for (const file of files.sort()) {
  hash.update(relative(root, file).split(sep).join('/'));
  hash.update('\0');
  hash.update(readFileSync(file));
  hash.update('\0');
}
process.stdout.write(hash.digest('hex'));
NODE
}

verify_bootstrap_progress_marker() {
  local candidate_migration_set_sha="$1"
  local expected_migration_count="$2"
  local expected_migration_digest="$3"
  local remote_config_dir="${REMOTE_WORKSPACE_CONFIG_DIR:-${REMOTE_DIR:-}/.workspace}"
  ssh -i "$SERVER_READ_KEY" \
    -o BatchMode=yes \
    -o ConnectTimeout=10 \
    -o StrictHostKeyChecking=accept-new \
    "$SERVER" \
    "BOOTSTRAP_PROGRESS_MARKER='$remote_config_dir/production-bootstrap-in-progress.json' \
DEPLOYED_RELEASE_FILE='$remote_config_dir/deployed-release.json' \
EXPECTED_BASELINE='$BOOTSTRAP_PRODUCTION_BASE' \
EXPECTED_CANDIDATE='$head_sha' \
EXPECTED_TREE='$head_tree' \
EXPECTED_MIGRATION_SET='$candidate_migration_set_sha' \
EXPECTED_LEGACY_RELEASE='$BOOTSTRAP_LEGACY_RELEASE_ID' \
EXPECTED_LEGACY_CNB_COMMIT='$BOOTSTRAP_LEGACY_CNB_COMMIT' \
EXPECTED_LEGACY_CNB_BUILD_SN='$BOOTSTRAP_LEGACY_CNB_BUILD_SN' \
EXPECTED_LEGACY_RUNTIME_VERSION='$BOOTSTRAP_LEGACY_RUNTIME_VERSION' \
EXPECTED_LEGACY_BUILD_ID='$BOOTSTRAP_LEGACY_BUILD_ID' \
EXPECTED_LEGACY_CNB_REPOSITORY='$CNB_REPO' \
EXPECTED_BASELINE_COUNT='$expected_migration_count' \
EXPECTED_BASELINE_DIGEST='$expected_migration_digest' python3 - <<'PY'
import json
import os
from pathlib import Path

marker = Path(os.environ['BOOTSTRAP_PROGRESS_MARKER'])
if not marker.exists():
    raise SystemExit(2)
if Path(os.environ['DEPLOYED_RELEASE_FILE']).exists():
    raise SystemExit('formal deployed-release exists; bootstrap progress marker must not be reused')
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
try:
    actual = json.loads(marker.read_text(encoding='utf-8'))
except Exception as error:
    raise SystemExit(f'production bootstrap progress marker is invalid: {error}')
if actual != expected:
    raise SystemExit('production bootstrap progress marker is not the exact same receipt and candidate')
PY"
}

read_last_deployed_record() {
  local ssh_key=""
  local remote_config_dir=""
  if [ -n "${REMOTE_WORKSPACE_CONFIG_DIR:-}" ]; then
    remote_config_dir="$REMOTE_WORKSPACE_CONFIG_DIR"
  elif [ -n "${REMOTE_DIR:-}" ]; then
    remote_config_dir="$REMOTE_DIR/.workspace"
  fi
  if [ -z "${SERVER:-}" ] || [ -z "$remote_config_dir" ]; then
    return 1
  fi
  ssh_key="${SERVER_READ_KEY:-}"
  if [ -z "$ssh_key" ]; then return 1; fi
  ssh -i "$ssh_key" \
    -o BatchMode=yes \
    -o ConnectTimeout=10 \
    -o StrictHostKeyChecking=accept-new \
    "$SERVER" \
    "DEPLOYED_RELEASE_FILE='$remote_config_dir/deployed-release.json' EXPECTED_REPOSITORY='$github_repository' EXPECTED_BRANCH='$RELEASE_BRANCH' python3 - <<'PY'
import json
import os
from pathlib import Path

path = Path(os.environ['DEPLOYED_RELEASE_FILE'])
if not path.exists():
    print('MISSING')
    raise SystemExit(0)
try:
    record = json.loads(path.read_text(encoding='utf-8'))
    commit = record['source']['commitSha']
    run_id = record['github']['runId']
    run_attempt = record['github']['runAttempt']
    digest = record['github']['actionsArtifactDigest']
    repository = record['github']['repository']
    branch = record['github']['branch']
except Exception:
    raise SystemExit(1)
if not isinstance(commit, str) or len(commit) != 40 or any(char not in '0123456789abcdef' for char in commit):
    raise SystemExit(1)
if not isinstance(run_id, int) or run_id < 1:
    raise SystemExit(1)
if not isinstance(run_attempt, int) or run_attempt < 1:
    raise SystemExit(1)
if not isinstance(digest, str) or not digest.startswith('sha256:') or len(digest) != 71 or any(char not in '0123456789abcdef' for char in digest[7:]):
    raise SystemExit(1)
if repository != os.environ['EXPECTED_REPOSITORY'] or branch != os.environ['EXPECTED_BRANCH']:
    raise SystemExit(1)
print(commit)
print(run_id)
print(run_attempt)
print(digest)
PY" \
    2>/dev/null
}

read_last_deployed_sha() {
  read_last_deployed_record | sed -n '1p'
}

prepare_server_read_key
bootstrap_context_file=""
if [ -n "$BOOTSTRAP_PRODUCTION_BASE" ]; then
  : "${CNB_REMOTE:?CNB_REMOTE not set in $OPS_ENV_FILE}"
  : "${CNB_REPO:?CNB_REPO not set in $OPS_ENV_FILE}"
  command -v cnb >/dev/null 2>&1 || {
    echo "[错误] production bootstrap 需要 cnb CLI 复验历史 build"
    exit 1
  }
  bootstrap_legacy_ref="refs/tags/workspace-production-bootstrap-${BOOTSTRAP_PRODUCTION_BASE:0:12}"
  legacy_anchor_sha="$(git ls-remote "$CNB_REMOTE" "$bootstrap_legacy_ref" | awk '{print $1}')"
  if [ -z "$legacy_anchor_sha" ]; then
    legacy_remote_sha="$(git ls-remote "$CNB_REMOTE" refs/heads/cnb-release | awk '{print $1}')"
    if [ "$legacy_remote_sha" != "$BOOTSTRAP_LEGACY_CNB_COMMIT" ]; then
      echo "[错误] 首次 bootstrap 前 CNB cnb-release 已不再指向 receipt 的 legacy commit，且不可变 anchor 不存在"
      exit 1
    fi
    echo "==> 首次创建不可变 legacy CNB anchor: $bootstrap_legacy_ref"
    git fetch --no-tags "$CNB_REMOTE" refs/heads/cnb-release
    git cat-file -e "${BOOTSTRAP_LEGACY_CNB_COMMIT}^{commit}"
    if ! git push --no-verify \
      --force-with-lease="$bootstrap_legacy_ref:" \
      "$CNB_REMOTE" "$BOOTSTRAP_LEGACY_CNB_COMMIT:$bootstrap_legacy_ref"; then
      legacy_anchor_sha="$(git ls-remote "$CNB_REMOTE" "$bootstrap_legacy_ref" | awk '{print $1}')"
      if [ "$legacy_anchor_sha" != "$BOOTSTRAP_LEGACY_CNB_COMMIT" ]; then
        echo "[错误] legacy CNB anchor 创建发生冲突"
        exit 1
      fi
    fi
  elif [ "$legacy_anchor_sha" != "$BOOTSTRAP_LEGACY_CNB_COMMIT" ]; then
    echo "[错误] legacy CNB anchor 已存在但指向其他 commit；禁止覆盖"
    exit 1
  fi
  echo "==> 从不可变 anchor 获取并复验 legacy CNB injection commit..."
  git fetch --no-tags "$CNB_REMOTE" "$bootstrap_legacy_ref"
  if [ "$(git rev-parse FETCH_HEAD)" != "$BOOTSTRAP_LEGACY_CNB_COMMIT" ]; then
    echo "[错误] legacy CNB anchor fetch 结果与 receipt 不一致"
    exit 1
  fi
  git cat-file -e "${BOOTSTRAP_LEGACY_CNB_COMMIT}^{commit}"
  bootstrap_context_file="$TMP_DIR/production-bootstrap-context.json"
  node scripts/ci/production-bootstrap-receipt.mjs create \
    --cwd "$SOURCE_DIR" \
    --baseline "$BOOTSTRAP_PRODUCTION_BASE" \
    --candidate "$head_sha" \
    --legacy-cnb-commit "$BOOTSTRAP_LEGACY_CNB_COMMIT" \
    --legacy-release-id "$BOOTSTRAP_LEGACY_RELEASE_ID" \
    --legacy-cnb-build-sn "$BOOTSTRAP_LEGACY_CNB_BUILD_SN" \
    --legacy-runtime-version "$BOOTSTRAP_LEGACY_RUNTIME_VERSION" \
    --legacy-build-id "$BOOTSTRAP_LEGACY_BUILD_ID" \
    --legacy-cnb-repository "$CNB_REPO" \
    --output "$bootstrap_context_file"
  legacy_history_file="$TMP_DIR/legacy-cnb-history.json"
  legacy_status_file="$TMP_DIR/legacy-cnb-status.json"
  env -u CNB_TOKEN cnb build get-build-logs \
    --repo "$CNB_REPO" \
    --sn "$BOOTSTRAP_LEGACY_CNB_BUILD_SN" \
    --sha "$BOOTSTRAP_LEGACY_CNB_COMMIT" \
    --status success \
    --page-size 10 \
    --verbose > "$legacy_history_file"
  env -u CNB_TOKEN cnb build get-build-status \
    --repo "$CNB_REPO" \
    --sn "$BOOTSTRAP_LEGACY_CNB_BUILD_SN" \
    --verbose > "$legacy_status_file"
  node scripts/ci/cnb-build-state.mjs verify-legacy-build \
    --history "$legacy_history_file" \
    --status "$legacy_status_file" \
    --repository "$CNB_REPO" \
    --sn "$BOOTSTRAP_LEGACY_CNB_BUILD_SN" \
    --sha "$BOOTSTRAP_LEGACY_CNB_COMMIT" >/dev/null
  bootstrap_migration_count="$(node -e 'const c=require(process.argv[1]); process.stdout.write(String(c.database.migrationCount));' "$bootstrap_context_file")"
  bootstrap_migration_digest="$(node -e 'const c=require(process.argv[1]); process.stdout.write(c.database.migrationSetSha256);' "$bootstrap_context_file")"
  bootstrap_candidate_migration_digest="$(compute_candidate_migration_set_sha)"
  if verify_bootstrap_progress_marker \
    "$bootstrap_candidate_migration_digest" \
    "$bootstrap_migration_count" \
    "$bootstrap_migration_digest"; then
    echo "==> 已验证同一 receipt/candidate 的 bootstrap-in-progress；锁内将复验可证明进展后续跑。"
  else
    progress_status=$?
    if [ "$progress_status" != "2" ]; then
      echo "[错误] production bootstrap progress marker 无法验证"
      exit 1
    fi
    verify_legacy_server_state \
      "$BOOTSTRAP_LEGACY_RELEASE_ID" \
      "$bootstrap_migration_count" \
      "$bootstrap_migration_digest" \
      "$BOOTSTRAP_LEGACY_RUNTIME_VERSION" \
      "$BOOTSTRAP_LEGACY_BUILD_ID"
  fi
fi
if ! last_deployed_record="$(read_last_deployed_record)"; then
  echo "[错误] 无法读取或验证服务器 deployed-release.json"
  exit 1
fi
last_deployed_sha="$(printf '%s\n' "$last_deployed_record" | sed -n '1p')"
last_deployed_run_id="$(printf '%s\n' "$last_deployed_record" | sed -n '2p')"
last_deployed_run_attempt="$(printf '%s\n' "$last_deployed_record" | sed -n '3p')"
last_deployed_artifact_digest="$(printf '%s\n' "$last_deployed_record" | sed -n '4p')"
needs_forced_full="$FORCE_FULL"
if [ "$last_deployed_sha" = "MISSING" ]; then
  if [ -z "$BOOTSTRAP_PRODUCTION_BASE" ]; then
    echo "[错误] 生产 deployed-release.json 缺失；必须使用经审计的一次性 production bootstrap receipt"
    exit 1
  fi
  last_deployed_sha="$BOOTSTRAP_PRODUCTION_BASE"
  last_deployed_run_id=""
  last_deployed_run_attempt=""
  last_deployed_artifact_digest=""
  needs_forced_full=1
  echo "==> 已复验 legacy 生产 receipt；从 ${last_deployed_sha:0:12} 累计分类并强制 C3/full。"
elif [ -n "$BOOTSTRAP_PRODUCTION_BASE" ]; then
  echo "[错误] deployed-release.json 已存在，禁止再次使用 production bootstrap receipt"
  exit 1
fi
if printf '%s' "$last_deployed_sha" | grep -Eq '^[0-9a-f]{40}$' \
  && git cat-file -e "${last_deployed_sha}^{commit}" 2>/dev/null \
  && git merge-base --is-ancestor "$last_deployed_sha" "$head_sha"; then
  if [ "$last_deployed_sha" = "$head_sha" ] && [ -z "$BOOTSTRAP_PRODUCTION_BASE" ] && [ "$FORCE_FULL" != "1" ] && [ "$PRINT_COMMAND_ONLY" != "1" ]; then
    echo "==> 生产记录已是 ${head_sha:0:12}；先复验实时健康与版本。"
    verify_server_runtime
    echo "==> 实时生产健康且版本一致；对账 GitHub production deployment 后退出。"
    reconcile_ok=0
    for attempt in 1 2 3 4 5; do
      if with_github_proxy node scripts/ci/production-deployment.mjs reconcile-success \
        --repository "$github_repository" \
        --sha "$head_sha" \
        --run-id "$last_deployed_run_id" \
        --run-attempt "$last_deployed_run_attempt" \
        --artifact-digest "$last_deployed_artifact_digest" \
        --environment production \
        --description "Production is serving ${head_sha:0:12}" >/dev/null; then
        reconcile_ok=1
        break
      fi
      echo "[警告] GitHub production deployment 对账失败（第 $attempt/5 次）"
      sleep 2
    done
    if [ "$reconcile_ok" != "1" ]; then
      echo "[错误] 服务器已是目标 SHA，但 GitHub production deployment 对账失败"
      exit 1
    fi
    exit 0
  fi
  echo "==> 分类累计发布差异 ${last_deployed_sha:0:12}..${head_sha:0:12}..."
  node scripts/ci/classify-risk.mjs \
    --base "$last_deployed_sha" \
    --head "$head_sha" \
    --diff-mode two-dot \
    --event deployment \
    --final-candidate \
    --publish-requested > "$classification_file"
  node scripts/ci/check-migration-policy.mjs \
    --base "$last_deployed_sha" \
    --head "$head_sha" \
    --diff-mode two-dot > "$migration_policy_file"
else
  echo "[错误] 无法证明服务器 deployed-release.json 中的生产基线是当前 main 的祖先。" >&2
  echo "[错误] 累计 migration 差异不可证明，拒绝发布；请先恢复或人工核验并重建生产发布证据。" >&2
  exit 1
fi

read_classification_field() {
  node -e 'const value=require(process.argv[1]); const path=process.argv[2].split("."); let current=value; for (const key of path) current=current?.[key]; if (Array.isArray(current)) process.stdout.write(JSON.stringify(current)); else process.stdout.write(String(current ?? ""));' \
    "$classification_file" "$1"
}

cumulative_risk="$(read_classification_field riskClass)"
cumulative_e2e="$(read_classification_field e2eMode)"
cumulative_suites="$(read_classification_field requiredSuites)"
echo "==> 累计风险: $cumulative_risk；浏览器测试: $cumulative_e2e"
if [ -f "$migration_policy_file" ]; then
  cumulative_maintenance="$(node -e 'const p=require(process.argv[1]); process.stdout.write(String(p.requiresMaintenance === true));' "$migration_policy_file")"
  if [ "$cumulative_maintenance" = "true" ]; then
    echo "==> 累计差异包含 maintenance migration；生产会先停止旧 Workspace/WeCom，再执行 migration。"
  fi
fi
if [ "$cumulative_risk" = "C0" ] && [ -z "$BOOTSTRAP_PRODUCTION_BASE" ] && [ "$needs_forced_full" != "1" ] && [ "$PRINT_COMMAND_ONLY" != "1" ]; then
  echo "==> 只有仓库文档变化，不生成或发布生产运行包。"
  exit 0
fi

release_tag_prefix="ci-artifact-$head_sha-run-"
release_tag=""
artifact_name_prefix="workspace-standalone-$head_sha-run-"
artifact_name=""
release_artifact_name="workspace-standalone.tgz"
release_manifest_name="workspace-standalone.manifest.json"
artifact_event=""
artifact_run_id=""
artifact_run_attempt=""
minimum_dispatch_run_id=""

release_list_json="$(with_github_proxy gh release list \
  --repo "$github_repository" \
  --limit 100 \
  --json tagName,isPrerelease)"
release_tag="$(RELEASE_TAG_PREFIX="$release_tag_prefix" RELEASE_LIST_JSON="$release_list_json" node - <<'NODE'
const releases = JSON.parse(process.env.RELEASE_LIST_JSON || '[]');
const prefix = process.env.RELEASE_TAG_PREFIX;
const candidates = releases
  .filter((release) => release.isPrerelease === true && release.tagName.startsWith(prefix))
  .map((release) => {
    const match = release.tagName.slice(prefix.length).match(/^([1-9][0-9]*)-attempt-([1-9][0-9]*)$/);
    return match ? { ...release, runId: Number(match[1]), runAttempt: Number(match[2]) } : null;
  })
  .filter(Boolean)
  .sort((left, right) => right.runId - left.runId || right.runAttempt - left.runAttempt);
process.stdout.write(candidates[0]?.tagName || '');
NODE
)"

if [ -n "$release_tag" ] && with_github_proxy gh release download "$release_tag" \
  --repo "$github_repository" \
  --pattern "$release_manifest_name" \
  --dir "$TMP_DIR" \
  --clobber >/dev/null 2>&1; then
  artifact_event="$(HEAD_SHA="$head_sha" HEAD_TREE="$head_tree" RELEASE_TAG="$release_tag" RELEASE_TAG_PREFIX="$release_tag_prefix" \
    node - "$classification_file" "$manifest_file" <<'NODE'
const { readFileSync } = require("fs");
const classification = JSON.parse(readFileSync(process.argv[2], "utf8"));
const manifest = JSON.parse(readFileSync(process.argv[3], "utf8"));
const order = { C0: 0, C1: 1, C2: 2, C3: 3 };
const build = manifest?.build ?? {};
const requiredSuites = new Set(classification.requiredSuites ?? []);
const coveredSuites = new Set(build.requiredSuites ?? []);
const fullCoverage = build.e2eMode === "full";
const suitesCovered = fullCoverage || [...requiredSuites].every((suite) => coveredSuites.has(suite));
const e2eCovered = classification.e2eMode === "none"
  || fullCoverage
  || (classification.e2eMode === "targeted" && build.e2eMode === "targeted" && suitesCovered);
const identityMatches = manifest?.source?.commitSha === process.env.HEAD_SHA
  && manifest?.source?.treeSha === process.env.HEAD_TREE
  && build.buildId === process.env.HEAD_SHA
  && build.targetSha === process.env.HEAD_SHA;
const riskCovered = order[build.riskClass] >= order[classification.riskClass];
const tagMatches = process.env.RELEASE_TAG === `${process.env.RELEASE_TAG_PREFIX}${build.githubRunId}-attempt-${build.githubRunAttempt}`;
if (!identityMatches || !tagMatches || !riskCovered || !e2eCovered) process.exit(3);
if (!['push', 'workflow_dispatch'].includes(build.githubEventName)) process.exit(4);
process.stdout.write(build.githubEventName);
NODE
  )" || needs_forced_full=1
  if [ "$needs_forced_full" != "1" ]; then
    artifact_run_id="$(node -e 'const m=require(process.argv[1]); const id=Number(m?.build?.githubRunId); if (!Number.isInteger(id) || id < 1) process.exit(2); process.stdout.write(String(id));' "$manifest_file")" \
      || needs_forced_full=1
  fi
  if [ "$needs_forced_full" != "1" ]; then
    artifact_run_attempt="$(node -e 'const m=require(process.argv[1]); const id=Number(m?.build?.githubRunAttempt); if (!Number.isInteger(id) || id < 1) process.exit(2); process.stdout.write(String(id));' "$manifest_file")" \
      || needs_forced_full=1
  fi
  if [ "$needs_forced_full" != "1" ]; then
    artifact_name="${artifact_name_prefix}${artifact_run_id}-attempt-${artifact_run_attempt}"
  fi
  if [ "$needs_forced_full" != "1" ]; then
    if with_github_proxy node ops/release-evidence.mjs check-run-viable \
      --repository "$github_repository" \
      --branch "$RELEASE_BRANCH" \
      --sha "$head_sha" \
      --workflow-name CI \
      --workflow-path .github/workflows/ci.yml \
      --event "$artifact_event" \
      --run-id "$artifact_run_id" \
      --run-attempt "$artifact_run_attempt" \
      --artifact-name "$artifact_name" >/dev/null; then
      :
    else
      liveness_status=$?
      if [ "$liveness_status" = "3" ]; then
        echo "==> 当前 SHA 的 CI run 已失效、被失败重跑取代或 artifact 已过期；升级为同 SHA 全量 CI。"
        needs_forced_full=1
      else
        echo "[错误] 无法验证当前 Actions artifact 是否仍可用"
        exit "$liveness_status"
      fi
    fi
  fi
else
  echo "==> 当前 SHA 没有可验证的 canonical artifact；升级为全量 CI。"
  needs_forced_full=1
fi

if [ "$needs_forced_full" = "1" ]; then
  echo "==> 触发指定 SHA 的全量 CI；连续触发时 GitHub 只保留最新运行。"
  minimum_dispatch_run_id="$(with_github_proxy gh api \
    "repos/${github_repository}/actions/workflows/ci.yml/runs?branch=${RELEASE_BRANCH}&event=workflow_dispatch&per_page=100" \
    --jq "[.workflow_runs[] | select(.head_sha == \"$head_sha\")] | map(.id) | max // 0")"
  with_github_proxy gh workflow run ci.yml \
    --repo "$github_repository" \
    --ref "$RELEASE_BRANCH" \
    -f force_full=true \
    -f target_sha="$head_sha" \
    -f publish_artifact=true
  artifact_event="workflow_dispatch"
fi

echo "==> 等待并验证受保护 main 的 CI、required check、产物与 prerelease 摘要..."
evidence_args=(
  verify-github
  --repository "$github_repository"
  --branch "$RELEASE_BRANCH"
  --sha "$head_sha"
  --tree "$head_tree"
  --workflow-name CI
  --workflow-path .github/workflows/ci.yml
  --required-job "CI / required"
  --artifact-name-prefix "$artifact_name_prefix"
  --event "$artifact_event"
  --release-tag-prefix "$release_tag_prefix"
  --release-artifact-name "$release_artifact_name"
  --release-manifest-name "$release_manifest_name"
  --timeout-seconds 1800
  --poll-seconds 10
  --output "$evidence_file"
)
if [ -n "$minimum_dispatch_run_id" ]; then
  evidence_args+=(--minimum-run-id "$minimum_dispatch_run_id")
fi
if [ -n "$bootstrap_context_file" ]; then
  evidence_args+=(--bootstrap-context "$bootstrap_context_file")
fi
with_github_proxy node ops/release-evidence.mjs "${evidence_args[@]}"

release_args=(--evidence "$evidence_file")
if [ "$PRINT_COMMAND_ONLY" = "1" ]; then
  release_args+=(--print-command)
else
  release_args+=(--result-file "$CNB_RESULT_FILE")
fi

echo "==> 触发 CNB 只下载并发布 GitHub 已测试的同 SHA 产物。"
if [ "$PRINT_COMMAND_ONLY" != "1" ]; then
  deployment_values="$TMP_DIR/deployment-values"
  node ops/release-evidence.mjs validate-file \
    --file "$evidence_file" \
    --sha "$head_sha" \
    --tree "$head_tree" \
    --format lines > "$deployment_values"
  deployment_run_id="$(sed -n '6p' "$deployment_values")"
  deployment_run_attempt="$(sed -n '7p' "$deployment_values")"
  deployment_artifact_digest="$(sed -n '12p' "$deployment_values")"
  GITHUB_DEPLOYMENT_ID="$(with_github_proxy node scripts/ci/production-deployment.mjs create \
    --repository "$github_repository" \
    --sha "$head_sha" \
    --run-id "$deployment_run_id" \
    --run-attempt "$deployment_run_attempt" \
    --artifact-digest "$deployment_artifact_digest" \
    --environment production)"
  with_github_proxy node scripts/ci/production-deployment.mjs status \
    --repository "$github_repository" \
    --deployment-id "$GITHUB_DEPLOYMENT_ID" \
    --state in_progress \
    --description "CNB is deploying verified artifact ${head_sha:0:12}" >/dev/null
fi
CNB_TRIGGER_STARTED=1
if ! env -u CNB_TOKEN OPS_ENV_FILE="$OPS_ENV_FILE" \
  "$SCRIPT_DIR/release-to-cnb.sh" "${release_args[@]}"; then
  if [ "$PRINT_COMMAND_ONLY" != "1" ]; then
    with_github_proxy node scripts/ci/production-deployment.mjs status \
      --repository "$github_repository" \
      --deployment-id "$GITHUB_DEPLOYMENT_ID" \
      --state failure \
      --description "CNB rejected the production build request" >/dev/null || true
    GITHUB_DEPLOYMENT_FINISHED=1
  fi
  echo "[错误] CNB 发布请求失败"
  exit 1
fi
if [ "$PRINT_COMMAND_ONLY" != "1" ]; then
  CNB_SN="$(node -e 'const r=require(process.argv[1]); if (!/^cnb-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(r.sn || "")) process.exit(2); process.stdout.write(r.sn);' "$CNB_RESULT_FILE")"
fi

if [ "$PRINT_COMMAND_ONLY" = "1" ]; then
  echo "==> --print-command：已更新 CNB release ref；未触发 build、未创建 GitHub production deployment，也未等待服务器切换。"
  exit 0
fi

echo "==> 等待服务器 deployed-release.json 确认 ${head_sha:0:12}（最长 ${DEPLOY_WAIT_SECONDS}s）..."
deploy_deadline=$(( $(date +%s) + DEPLOY_WAIT_SECONDS ))
while [ "$(date +%s)" -le "$deploy_deadline" ]; do
  cnb_state="$(query_cnb_state 2>/dev/null || true)"
  if [ "$cnb_state" = "failure" ]; then
    with_github_proxy node scripts/ci/production-deployment.mjs status \
      --repository "$github_repository" \
      --deployment-id "$GITHUB_DEPLOYMENT_ID" \
      --state failure \
      --description "CNB reported a terminal production build failure" >/dev/null
    GITHUB_DEPLOYMENT_FINISHED=1
    echo "[错误] CNB build $CNB_SN 已终止失败"
    exit 1
  fi
  observed_deployed_sha="$(read_last_deployed_sha || true)"
  if [ "$observed_deployed_sha" = "$head_sha" ]; then
    observed_record="$(read_last_deployed_record || true)"
    observed_run_id="$(printf '%s\n' "$observed_record" | sed -n '2p')"
    observed_run_attempt="$(printf '%s\n' "$observed_record" | sed -n '3p')"
    observed_artifact_digest="$(printf '%s\n' "$observed_record" | sed -n '4p')"
    if [ "$observed_run_id" != "$deployment_run_id" ] \
      || [ "$observed_run_attempt" != "$deployment_run_attempt" ] \
      || [ "$observed_artifact_digest" != "$deployment_artifact_digest" ]; then
      echo "[警告] 服务器 SHA 已切换，但 CI run/digest 证据尚未原子同步，继续等待..."
      sleep 10
      continue
    fi
    if ! verify_server_runtime; then
      echo "[警告] 服务器发布记录已更新，但实时健康或版本尚未通过，继续等待..."
      sleep 10
      continue
    fi
    PRODUCTION_CONFIRMED=1
    GITHUB_DEPLOYMENT_FINISHED=1
    reconcile_ok=0
    for attempt in 1 2 3 4 5; do
      if with_github_proxy node scripts/ci/production-deployment.mjs reconcile-success \
        --repository "$github_repository" \
        --sha "$head_sha" \
        --run-id "$deployment_run_id" \
        --run-attempt "$deployment_run_attempt" \
        --artifact-digest "$deployment_artifact_digest" \
        --environment production \
        --description "Production is serving ${head_sha:0:12}" >/dev/null; then
        reconcile_ok=1
        break
      fi
      echo "[警告] GitHub production deployment 成功状态写入失败（第 $attempt/5 次）"
      sleep 2
    done
    if [ "$reconcile_ok" != "1" ]; then
      echo "[错误] 生产已成功切换，但 GitHub deployment 暂未对账；下次 deploy 会自动修复"
      exit 1
    fi
    echo "==> deploy 完成：GitHub production deployment 与服务器 SHA 已同步。"
    exit 0
  fi
  sleep 10
done

final_cnb_state="$(query_cnb_state 2>/dev/null || true)"
if [ "$final_cnb_state" = "failure" ]; then
  with_github_proxy node scripts/ci/production-deployment.mjs status \
    --repository "$github_repository" \
    --deployment-id "$GITHUB_DEPLOYMENT_ID" \
    --state failure \
    --description "CNB reported a terminal production build failure" >/dev/null
  GITHUB_DEPLOYMENT_FINISHED=1
  echo "[错误] CNB build $CNB_SN 已终止失败"
else
  echo "[错误] 等待生产 SHA 超时；CNB 状态为 ${final_cnb_state:-unknown}，GitHub deployment 保持 in_progress，后续同 SHA deploy 会对账"
fi
exit 1
