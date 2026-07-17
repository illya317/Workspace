#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PUBLISH_STARTED_EPOCH_SECONDS="${PUBLISH_STARTED_EPOCH_SECONDS:-$(date +%s)}"
PUBLISH_STARTED_AT="${PUBLISH_STARTED_AT:-$(date '+%Y-%m-%d %H:%M:%S %z')}"
export PUBLISH_STARTED_EPOCH_SECONDS PUBLISH_STARTED_AT
if [ "${WORKSPACE_REPO_RUNTIME_READY:-0}" != "1" ]; then
  exec "$REPOSITORY_ROOT/scripts/runtime/run-with-repo-node.sh" "$0" "$@"
fi
OPS_ENV_FILE="${OPS_ENV_FILE:-$SCRIPT_DIR/.env}"
# shellcheck source=/dev/null
source "$OPS_ENV_FILE"

: "${SOURCE_DIR:?SOURCE_DIR not set in $OPS_ENV_FILE}"
: "${RELEASE_BRANCH:?RELEASE_BRANCH not set in $OPS_ENV_FILE}"
: "${CNB_REMOTE:?CNB_REMOTE not set in $OPS_ENV_FILE}"
: "${CNB_REPO:?CNB_REPO not set in $OPS_ENV_FILE}"
: "${SERVER:?SERVER not set in $OPS_ENV_FILE}"
: "${REMOTE_DIR:?REMOTE_DIR not set in $OPS_ENV_FILE}"
: "${HEALTHCHECK_URL:?HEALTHCHECK_URL not set in $OPS_ENV_FILE}"

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
SERVER_READ_KEY=""

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
  --print-command
EOF
}

cleanup() {
  rm -rf "${TMP_DIR:-}"
  rm -f "${TMP_KEY:-}"
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

while [ "$#" -gt 0 ]; do
  case "$1" in
    --bootstrap-production-base) shift; BOOTSTRAP_PRODUCTION_BASE="${1:-}" ;;
    --bootstrap-legacy-cnb-commit) shift; BOOTSTRAP_LEGACY_CNB_COMMIT="${1:-}" ;;
    --bootstrap-legacy-release-id) shift; BOOTSTRAP_LEGACY_RELEASE_ID="${1:-}" ;;
    --bootstrap-legacy-cnb-build-sn) shift; BOOTSTRAP_LEGACY_CNB_BUILD_SN="${1:-}" ;;
    --bootstrap-legacy-runtime-version) shift; BOOTSTRAP_LEGACY_RUNTIME_VERSION="${1:-}" ;;
    --bootstrap-legacy-build-id) shift; BOOTSTRAP_LEGACY_BUILD_ID="${1:-}" ;;
    --print-command) PRINT_COMMAND_ONLY=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "[错误] 未知参数: $1"; usage; exit 1 ;;
  esac
  shift
done

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

for pair in \
  "$BOOTSTRAP_PRODUCTION_BASE:production bootstrap SHA" \
  "$BOOTSTRAP_LEGACY_CNB_COMMIT:legacy CNB commit"; do
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

TMP_DIR="$(mktemp -d)"
if [ "$PRINT_COMMAND_ONLY" = "0" ]; then
  prepare_server_read_key
fi

if [ "$PRINT_COMMAND_ONLY" = "0" ] && [ -z "$BOOTSTRAP_PRODUCTION_BASE" ]; then
  echo "==> 部署前读取生产 canonical 回执与恢复状态..."
  production_state="$(ssh -i "$SERVER_READ_KEY" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "$SERVER" \
    "if [ -e '$REMOTE_DIR/.workspace/maintenance-deploy' ]; then printf maintenance; elif [ -e '$REMOTE_DIR/.workspace/production-bootstrap-in-progress.json' ]; then printf bootstrap; elif [ -f '$REMOTE_DIR/.workspace/deployed-release.json' ]; then printf ready; else printf missing; fi")"
  case "$production_state" in
    ready) ;;
    maintenance)
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
  node ops/production-deploy-preflight.mjs \
    --cwd "$SOURCE_DIR" \
    --receipt "$PRODUCTION_RECEIPT_FILE" \
    --candidate "$SOURCE_SHA" \
    --candidate-tree "$SOURCE_TREE" \
    --expected-repository "$CNB_REPO" > "$PREFLIGHT_RESULT_FILE"
  node -e '
    const result = require(process.argv[1]);
    const migrations = result.migration.changedMigrations.length;
    const mode = result.migration.requiresMaintenance ? "maintenance" : "expand/none";
    console.log(`==> 生产预检通过: canonical ${result.production.canonicalSha.slice(0, 12)} -> candidate ${result.candidate.commitSha.slice(0, 12)}; migrations ${migrations} (${mode})`);
  ' "$PREFLIGHT_RESULT_FILE"
fi

LOCAL_CI_RECEIPT_FILE="$(git rev-parse --git-path workspace-local-full-ci.json)"
if node scripts/ci/local-full-ci-receipt.mjs verify \
  --tree "$SOURCE_TREE" \
  --file "$LOCAL_CI_RECEIPT_FILE" >/dev/null 2>&1; then
  echo "==> 复用当前 tree 的本地全量 CI 凭证: ${SOURCE_TREE:0:12}"
else
  echo "==> 当前 tree 尚无有效全量凭证；运行一次本地全量 CI..."
  npm run check:ci
  if [ -n "$(git status --short)" ]; then
    echo "[错误] 本地全量 CI 后工作区发生变化，拒绝生成发布凭证"
    git status --short
    exit 1
  fi
  test "$(git rev-parse 'HEAD^{tree}')" = "$SOURCE_TREE"
  node scripts/ci/local-full-ci-receipt.mjs create \
    --tree "$SOURCE_TREE" \
    --output "$LOCAL_CI_RECEIPT_FILE"
  echo "==> 本地全量 CI 已通过并绑定 tree: ${SOURCE_TREE:0:12}"
fi

METADATA_FILE="$TMP_DIR/cnb-release.json"
RESULT_FILE="$TMP_DIR/cnb-trigger.json"
BASELINE_MIGRATION_COUNT=""
BASELINE_MIGRATION_DIGEST=""
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

SOURCE_SHA="$SOURCE_SHA" SOURCE_TREE="$SOURCE_TREE" CNB_REPO="$CNB_REPO" RELEASE_BRANCH="$RELEASE_BRANCH" \
BOOTSTRAP_PRODUCTION_BASE="$BOOTSTRAP_PRODUCTION_BASE" BOOTSTRAP_LEGACY_CNB_COMMIT="$BOOTSTRAP_LEGACY_CNB_COMMIT" \
BOOTSTRAP_LEGACY_RELEASE_ID="$BOOTSTRAP_LEGACY_RELEASE_ID" BOOTSTRAP_LEGACY_CNB_BUILD_SN="$BOOTSTRAP_LEGACY_CNB_BUILD_SN" \
BOOTSTRAP_LEGACY_RUNTIME_VERSION="$BOOTSTRAP_LEGACY_RUNTIME_VERSION" BOOTSTRAP_LEGACY_BUILD_ID="$BOOTSTRAP_LEGACY_BUILD_ID" \
BASELINE_MIGRATION_COUNT="$BASELINE_MIGRATION_COUNT" BASELINE_MIGRATION_DIGEST="$BASELINE_MIGRATION_DIGEST" \
LOCAL_CI_RECEIPT_FILE="$LOCAL_CI_RECEIPT_FILE" METADATA_FILE="$METADATA_FILE" \
PUBLISH_STARTED_EPOCH_SECONDS="$PUBLISH_STARTED_EPOCH_SECONDS" node <<'NODE'
const fs = require('node:fs');
const localFullCi = JSON.parse(fs.readFileSync(process.env.LOCAL_CI_RECEIPT_FILE, 'utf8'));
const startedAtEpochSeconds = Number(process.env.PUBLISH_STARTED_EPOCH_SECONDS);
if (!Number.isSafeInteger(startedAtEpochSeconds) || startedAtEpochSeconds <= 0) {
  throw new Error('publish start epoch is invalid');
}
const metadata = {
  schemaVersion: 1,
  source: { commitSha: process.env.SOURCE_SHA, treeSha: process.env.SOURCE_TREE },
  localFullCi,
  cnb: { repository: process.env.CNB_REPO, sourceBranch: process.env.RELEASE_BRANCH },
  deployment: { startedAtEpochSeconds },
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
fs.writeFileSync(process.env.METADATA_FILE, `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 });
NODE

release_args=(--metadata "$METADATA_FILE" --result-file "$RESULT_FILE")
[ "$PRINT_COMMAND_ONLY" = "0" ] || release_args+=(--print-command)
if [ "$PRINT_COMMAND_ONLY" = "0" ]; then
  echo "==> 正式部署计时开始: $PUBLISH_STARTED_AT"
fi
env -u CNB_TOKEN OPS_ENV_FILE="$OPS_ENV_FILE" "$SCRIPT_DIR/release-to-cnb.sh" "${release_args[@]}"
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
  deployed_sha="$(ssh -i "$SERVER_READ_KEY" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "$SERVER" \
    "python3 -c \"import json; from pathlib import Path; p=Path('$REMOTE_DIR/.workspace/deployed-release.json'); print(json.loads(p.read_text())['source']['commitSha'] if p.exists() else '')\"" 2>/dev/null || true)"
  if [ "$deployed_sha" = "$SOURCE_SHA" ] && [ "$cnb_state" = "success" ]; then
    ssh -i "$SERVER_READ_KEY" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "$SERVER" \
      "set -e; curl -fsS '$HEALTHCHECK_URL' >/dev/null; test \"\$(curl -fsS http://127.0.0.1:3000/workspace/api/settings/version | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>process.stdout.write(JSON.parse(s).version))')\" = '$SOURCE_SHA'"
    echo "==> CNB-native 生产部署完成: $SOURCE_SHA ($CNB_SN)"
    FORMAL_DEPLOY_FINISHED_EPOCH="$(date +%s)"
    FORMAL_DEPLOY_FINISHED_AT="$(date '+%Y-%m-%d %H:%M:%S %z')"
    FORMAL_DEPLOY_DURATION="$((FORMAL_DEPLOY_FINISHED_EPOCH - PUBLISH_STARTED_EPOCH_SECONDS))"
    echo "==> 正式部署计时结束: $FORMAL_DEPLOY_FINISHED_AT"
    echo "==> 正式部署总耗时: $(format_duration "$FORMAL_DEPLOY_DURATION") (${FORMAL_DEPLOY_DURATION}s)"
    exit 0
  fi
  sleep 10
done

echo "[错误] 等待 CNB/生产部署超时: $CNB_SN"
exit 1
