#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPS_ENV_FILE="${OPS_ENV_FILE:-$SCRIPT_DIR/.env}"
# shellcheck source=/dev/null
source "$OPS_ENV_FILE"

: "${SOURCE_DIR:?SOURCE_DIR not set in $OPS_ENV_FILE}"
: "${RELEASE_BRANCH:?RELEASE_BRANCH not set in $OPS_ENV_FILE}"
: "${CNB_REMOTE:?CNB_REMOTE not set in $OPS_ENV_FILE}"
: "${CNB_REPO:?CNB_REPO not set in $OPS_ENV_FILE}"

BOOTSTRAP_PRODUCTION_BASE=""
BOOTSTRAP_LEGACY_CNB_COMMIT=""
BOOTSTRAP_LEGACY_RELEASE_ID=""
BOOTSTRAP_LEGACY_CNB_BUILD_SN=""
BOOTSTRAP_LEGACY_RUNTIME_VERSION=""
BOOTSTRAP_LEGACY_BUILD_ID=""
PRINT_COMMAND_ONLY=0
DEPLOY_WAIT_SECONDS="${DEPLOY_WAIT_SECONDS:-1800}"
TMP_DIR=""
TMP_KEY=""

cleanup() {
  rm -rf "${TMP_DIR:-}"
  rm -f "${TMP_KEY:-}"
}
trap cleanup EXIT

while [ "$#" -gt 0 ]; do
  case "$1" in
    deploy) ;;
    --bootstrap-production-base) shift; BOOTSTRAP_PRODUCTION_BASE="${1:-}" ;;
    --bootstrap-legacy-cnb-commit) shift; BOOTSTRAP_LEGACY_CNB_COMMIT="${1:-}" ;;
    --bootstrap-legacy-release-id) shift; BOOTSTRAP_LEGACY_RELEASE_ID="${1:-}" ;;
    --bootstrap-legacy-cnb-build-sn) shift; BOOTSTRAP_LEGACY_CNB_BUILD_SN="${1:-}" ;;
    --bootstrap-legacy-runtime-version) shift; BOOTSTRAP_LEGACY_RUNTIME_VERSION="${1:-}" ;;
    --bootstrap-legacy-build-id) shift; BOOTSTRAP_LEGACY_BUILD_ID="${1:-}" ;;
    --print-command) PRINT_COMMAND_ONLY=1 ;;
    -h|--help)
      "$SCRIPT_DIR/release-to-cnb.sh" --help
      exit 0
      ;;
    *) echo "[错误] CNB deploy 不支持参数: $1"; exit 1 ;;
  esac
  shift
done

case "$DEPLOY_WAIT_SECONDS" in
  ''|*[!0-9]*) echo "[错误] DEPLOY_WAIT_SECONDS 必须是正整数"; exit 1 ;;
esac
[ "$DEPLOY_WAIT_SECONDS" -ge 1 ] || { echo "[错误] DEPLOY_WAIT_SECONDS 必须至少为 1"; exit 1; }

bootstrap_values=(
  "$BOOTSTRAP_LEGACY_CNB_COMMIT"
  "$BOOTSTRAP_LEGACY_RELEASE_ID"
  "$BOOTSTRAP_LEGACY_CNB_BUILD_SN"
  "$BOOTSTRAP_LEGACY_RUNTIME_VERSION"
  "$BOOTSTRAP_LEGACY_BUILD_ID"
)
bootstrap_count=0
for value in "${bootstrap_values[@]}"; do [ -n "$value" ] && bootstrap_count=$((bootstrap_count + 1)); done
if [ -n "$BOOTSTRAP_PRODUCTION_BASE" ] && [ "$bootstrap_count" != "5" ]; then
  echo "[错误] production bootstrap 必须提供完整 legacy receipt"
  exit 1
fi
if [ -z "$BOOTSTRAP_PRODUCTION_BASE" ] && [ "$bootstrap_count" != "0" ]; then
  echo "[错误] legacy bootstrap 参数只能与 --bootstrap-production-base 同时使用"
  exit 1
fi
if [ -n "$BOOTSTRAP_PRODUCTION_BASE" ] && [ "$PRINT_COMMAND_ONLY" = "1" ]; then
  echo "[错误] production bootstrap 禁止 --print-command"
  exit 1
fi

cd "$SOURCE_DIR"
dirty_status="$(git status --short)"
if [ -n "$dirty_status" ]; then
  echo "[错误] 工作区存在未提交改动，请先提交："
  echo "$dirty_status"
  exit 1
fi
current_branch="$(git rev-parse --abbrev-ref HEAD)"
[ "$current_branch" = "$RELEASE_BRANCH" ] || { echo "[错误] deploy 只能从 $RELEASE_BRANCH 执行"; exit 1; }
head_sha="$(git rev-parse HEAD)"

TMP_DIR="$(mktemp -d)"
result_file="$TMP_DIR/cnb-trigger.json"
release_args=(--result-file "$result_file")
if [ "$PRINT_COMMAND_ONLY" = "1" ]; then release_args=(--print-command); fi

if [ -n "$BOOTSTRAP_PRODUCTION_BASE" ]; then
  bootstrap_context="$TMP_DIR/production-bootstrap.json"
  bootstrap_tag="refs/tags/workspace-production-bootstrap-${BOOTSTRAP_PRODUCTION_BASE:0:12}"
  echo "==> 从 CNB 不可变 anchor 获取 legacy 生产接管凭证..."
  git fetch --no-tags "$CNB_REMOTE" "$bootstrap_tag"
  [ "$(git rev-parse FETCH_HEAD)" = "$BOOTSTRAP_LEGACY_CNB_COMMIT" ] || {
    echo "[错误] legacy CNB anchor 与 receipt 不一致"
    exit 1
  }
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
    --output "$bootstrap_context"
  release_args+=(--bootstrap-context "$bootstrap_context")
fi

OPS_ENV_FILE="$OPS_ENV_FILE" "$SCRIPT_DIR/release-to-cnb.sh" "${release_args[@]}"
if [ "$PRINT_COMMAND_ONLY" = "1" ]; then exit 0; fi

cnb_sn="$(node -e 'const r=require(process.argv[1]); process.stdout.write(r.sn)' "$result_file")"
echo "==> 等待 CNB native build/deploy ${cnb_sn}（最长 ${DEPLOY_WAIT_SECONDS}s）..."
deadline=$(( $(date +%s) + DEPLOY_WAIT_SECONDS ))
status_file="$TMP_DIR/cnb-status.json"
while [ "$(date +%s)" -le "$deadline" ]; do
  if env -u CNB_TOKEN cnb build get-build-status --repo "$CNB_REPO" --sn "$cnb_sn" --verbose > "$status_file"; then
    state="$(node scripts/ci/cnb-build-state.mjs classify-status --input "$status_file")"
    if [ "$state" = "success" ]; then break; fi
    if [ "$state" = "failure" ]; then
      cat "$status_file"
      echo "[错误] CNB build $cnb_sn 失败"
      exit 1
    fi
  fi
  sleep 10
done
if [ "${state:-unknown}" != "success" ]; then
  echo "[错误] 等待 CNB build $cnb_sn 超时"
  exit 1
fi

if [ -n "${KEY:-}" ] && [ -f "$KEY" ]; then
  read_key="$KEY"
elif [ -n "${KEY_CONTENT:-}" ]; then
  TMP_KEY="$(mktemp)"
  printf '%s\n' "$KEY_CONTENT" > "$TMP_KEY"
  chmod 600 "$TMP_KEY"
  read_key="$TMP_KEY"
else
  echo "[错误] 缺少生产只读验证 KEY/KEY_CONTENT"
  exit 1
fi

echo "==> 复验生产记录、PM2、健康与版本..."
ssh -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new -i "$read_key" "${SERVER:?SERVER not set}" \
  "EXPECTED_SHA='$head_sha' EXPECTED_REPOSITORY='$CNB_REPO' HEALTHCHECK_URL='${HEALTHCHECK_URL:?HEALTHCHECK_URL not set}' REMOTE_WORKSPACE_CONFIG_DIR='${REMOTE_WORKSPACE_CONFIG_DIR:?REMOTE_WORKSPACE_CONFIG_DIR not set}' node - <<'NODE'
const fs = require('fs');
const { execFileSync } = require('child_process');
const path = require('path');
const record = JSON.parse(fs.readFileSync(path.join(process.env.REMOTE_WORKSPACE_CONFIG_DIR, 'deployed-release.json'), 'utf8'));
if (record?.schemaVersion !== 2
  || record?.source?.commitSha !== process.env.EXPECTED_SHA
  || record?.cnb?.repository !== process.env.EXPECTED_REPOSITORY
  || !/^sha256:[0-9a-f]{64}$/.test(record?.artifact?.digest ?? '')) {
  throw new Error('production deployed-release does not match CNB source identity');
}
const processes = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8' }));
for (const name of ['workspace', 'workspace-wecom-agent']) {
  const process = processes.find((item) => item.name === name);
  if (!process || process.pm2_env?.status !== 'online') throw new Error(name + ' is not online');
}
const health = execFileSync('curl', ['-fsS', process.env.HEALTHCHECK_URL], { encoding: 'utf8' });
void health;
const version = JSON.parse(execFileSync('curl', ['-fsS', 'http://127.0.0.1:3000/workspace/api/settings/version'], { encoding: 'utf8' }));
if (version?.version !== process.env.EXPECTED_SHA) throw new Error('production version does not match deployed SHA');
console.log(JSON.stringify({ source: record.source.commitSha, release: record.deployment.releaseId, artifact: record.artifact.digest }));
NODE"

echo "==> CNB-only deploy 完成: ${head_sha:0:12}"
