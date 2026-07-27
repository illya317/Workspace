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

: "${SOURCE_DIR:?SOURCE_DIR not set in $OPS_ENV_FILE}"
: "${CNB_REMOTE:?CNB_REMOTE not set in $OPS_ENV_FILE}"
: "${RELEASE_BRANCH:?RELEASE_BRANCH not set in $OPS_ENV_FILE}"
: "${WORKSPACE_CONFIG_DIR:?WORKSPACE_CONFIG_DIR not set in $OPS_ENV_FILE}"
CNB_REAL_CNB_YML="${CNB_REAL_CNB_YML:-$WORKSPACE_CONFIG_DIR/config/tenant/cnb-release.yml}"

ALLOW_DIRTY=0
PRINT_COMMAND_ONLY=0
METADATA_FILE=""
RESULT_FILE=""
TRIGGER_RESPONSE_FILE=""
INTERNAL_RESULT_FILE=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --allow-dirty) ALLOW_DIRTY=1 ;;
    --print-command) PRINT_COMMAND_ONLY=1 ;;
    --result-file)
      shift
      if [ "$#" -eq 0 ]; then
        echo "[错误] --result-file 缺少文件路径"
        exit 1
      fi
      RESULT_FILE="$1"
      ;;
    --metadata)
      shift
      if [ "$#" -eq 0 ]; then
        echo "[错误] --metadata 缺少文件路径"
        exit 1
      fi
      METADATA_FILE="$1"
      ;;
    -h|--help)
      cat <<'EOF'
用法:
  OPS_ENV_FILE=/path/to/ops/.env release-to-cnb.sh [选项]

选项:
  --metadata FILE  必填；本地 source 与 CNB/production bootstrap 发布元数据
  --allow-dirty  允许工作区存在其他未提交改动（会自动 stash/pop）
  --print-command  更新 CNB release ref 后只打印 start-build 命令，不触发 build
  --result-file FILE  将已接受的 CNB build SN/日志 URL 原子写入 FILE

脚本不连接 GitHub；它从本地 release 创建一个仅包含真实 .cnb.yml
与 .cnb-release.json 的注入提交，并推送/触发 CNB。
EOF
      exit 0
      ;;
    *) echo "[错误] 未知参数: $1"; exit 1 ;;
  esac
  shift
done

cd "$SOURCE_DIR"

if [ -z "$METADATA_FILE" ] || [ ! -f "$METADATA_FILE" ]; then
  echo "[错误] 必须通过 --metadata 指定可读的 CNB release metadata 文件"
  exit 1
fi
if [ -n "$RESULT_FILE" ]; then
  case "$RESULT_FILE" in
    /*) ;;
    *) echo "[错误] --result-file 必须是绝对路径"; exit 1 ;;
  esac
  rm -f "$RESULT_FILE"
fi
METADATA_FILE="$(cd "$(dirname "$METADATA_FILE")" && pwd)/$(basename "$METADATA_FILE")"

if [ ! -f "$CNB_REAL_CNB_YML" ]; then
  echo "[错误] 真实 CNB 配置文件不存在: $CNB_REAL_CNB_YML"
  exit 1
fi

if grep -qE '<owner>|<env-repo>' "$CNB_REAL_CNB_YML"; then
  echo "[错误] 真实 CNB 配置文件仍包含占位符: $CNB_REAL_CNB_YML"
  exit 1
fi
node "$SCRIPT_DIR/validate-cnb-release-config.mjs" "$CNB_REAL_CNB_YML"

current_branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$current_branch" != "$RELEASE_BRANCH" ]; then
  echo "[错误] 当前分支是 ${current_branch}，请切换到 $RELEASE_BRANCH 后再发布"
  exit 1
fi

if ! git diff --quiet -- .cnb.yml .cnb-release.json \
  || ! git diff --cached --quiet -- .cnb.yml .cnb-release.json; then
  echo "[错误] CNB 注入文件有未提交改动，请先处理"
  exit 1
fi
if [ -e .cnb-release.json ]; then
  echo "[错误] canonical source 不应包含 .cnb-release.json；请先移除残留注入文件"
  exit 1
fi

other_changes="$(git status --short -- . ':(exclude).cnb.yml' ':(exclude).cnb-release.json' || true)"
if [ -n "$other_changes" ]; then
  if [ "$ALLOW_DIRTY" != "1" ]; then
    echo "[错误] 工作区存在其他未提交改动。请先提交或清理，或使用 --allow-dirty 自动暂存："
    echo "$other_changes"
    exit 1
  fi
  echo "==> 暂存其他未提交改动（--allow-dirty）..."
  git stash push -m "release-to-cnb auto stash" --include-untracked -- . \
    ':(exclude).cnb.yml' ':(exclude).cnb-release.json'
fi

cleanup() {
  local exit_code=$?
  local release_branch="${CNB_RELEASE_BRANCH:-cnb-release}"
  git checkout "$RELEASE_BRANCH" 2>/dev/null || true
  git branch -D "$release_branch" 2>/dev/null || true
  rm -f "${TRIGGER_RESPONSE_FILE:-}" "${INTERNAL_RESULT_FILE:-}"
  if [ "$ALLOW_DIRTY" = "1" ] && [ -n "$other_changes" ]; then
    echo "==> 恢复暂存的改动..."
    if ! git stash pop; then
      echo "[严重] 恢复暂存改动失败，请手动执行 'git stash list' 和 'git stash pop' 检查。"
      exit 1
    fi
  fi
  return $exit_code
}
trap cleanup EXIT

echo "==> 验证本地 $RELEASE_BRANCH source 与 CNB release metadata..."
canonical_sha="$(git rev-parse HEAD)"
canonical_tree="$(git rev-parse 'HEAD^{tree}')"
metadata_values="$(node - "$METADATA_FILE" "$canonical_sha" "$canonical_tree" "$CNB_REPO" "$RELEASE_BRANCH" <<'NODE'
const fs = require('node:fs');
const [file, sha, tree, repository, branch] = process.argv.slice(2);
const metadata = JSON.parse(fs.readFileSync(file, 'utf8'));
const localTiming = metadata.deployment?.localTiming;
const localTimingKeys = 'releaseAttemptCount,releaseProcessSeconds,releaseProcessStartedAt,tenantSyncSeconds';
const validLocalTiming = localTiming
  && Object.keys(localTiming).sort().join(',') === localTimingKeys
  && Number.isSafeInteger(localTiming.releaseProcessSeconds)
  && localTiming.releaseProcessSeconds >= 0
  && Number.isSafeInteger(localTiming.releaseAttemptCount)
  && localTiming.releaseAttemptCount >= 1
  && typeof localTiming.releaseProcessStartedAt === 'string'
  && !Number.isNaN(Date.parse(localTiming.releaseProcessStartedAt))
  && Number.isSafeInteger(localTiming.tenantSyncSeconds)
  && localTiming.tenantSyncSeconds >= 0;
if (metadata.schemaVersion !== 1
  || metadata.source?.commitSha !== sha
  || metadata.source?.treeSha !== tree
  || metadata.localReleaseGate?.schemaVersion !== 2
  || metadata.localReleaseGate?.kind !== 'workspace-local-release-gate'
  || metadata.localReleaseGate?.status !== 'passed'
  || metadata.localReleaseGate?.command !== 'ops/local-release-gate.sh'
  || metadata.localReleaseGate?.sourceSha !== sha
  || metadata.localReleaseGate?.treeSha !== tree
  || JSON.stringify(metadata.localReleaseGate?.checks) !== JSON.stringify([
    'full-ci',
    'disposable-postgresql-migrations',
    'resource-seed',
    'playwright-e2e',
  ])
  || metadata.localReleaseGate?.fullCi?.schemaVersion !== 1
  || metadata.localReleaseGate?.fullCi?.kind !== 'workspace-local-full-ci'
  || metadata.localReleaseGate?.fullCi?.status !== 'passed'
  || metadata.localReleaseGate?.fullCi?.command !== 'npm run check:ci'
  || metadata.localReleaseGate?.fullCi?.treeSha !== tree
  || !Number.isFinite(Date.parse(metadata.localReleaseGate?.completedAt ?? ''))
  || metadata.cnb?.repository !== repository
  || metadata.cnb?.sourceBranch !== branch
  || !Number.isSafeInteger(metadata.deployment?.startedAtEpochSeconds)
  || metadata.deployment.startedAtEpochSeconds <= 0
  || !validLocalTiming) {
  throw new Error('CNB release metadata does not match local source');
}
const target = metadata.deployment?.target;
if (!target || !['monolith', 'unit'].includes(target.kind)) {
  throw new Error('CNB release metadata target is invalid');
}
if (target.kind === 'monolith') {
  if (Object.keys(target).length !== 1) throw new Error('monolith target contains unsupported fields');
} else if (!/^[a-z][a-z0-9-]*$/.test(target.unitId ?? '')
  || !['shadow', 'activate'].includes(target.mode)
  || Object.keys(target).sort().join(',') !== 'kind,mode,unitId') {
  throw new Error('unit target must bind one shadow or activate deploy unit');
}
const genesis = metadata.deploymentGenesis;
if (metadata.deploymentBootstrap && genesis) throw new Error('bootstrap and genesis metadata are mutually exclusive');
if (genesis) {
  if (target.kind !== 'monolith'
    || Object.keys(genesis).sort().join(',') !== 'baselineChecksum,baselineMigration,fromSourceSha,legacyMigrationCount,legacyMigrationSetSha256'
    || !/^[0-9a-f]{40}$/.test(genesis.fromSourceSha ?? '')
    || genesis.fromSourceSha === sha
    || !Number.isSafeInteger(genesis.legacyMigrationCount)
    || genesis.legacyMigrationCount < 1
    || !/^[0-9a-f]{64}$/.test(genesis.legacyMigrationSetSha256 ?? '')
    || genesis.baselineMigration !== '00000000000000_sanitized_baseline'
    || !/^[0-9a-f]{64}$/.test(genesis.baselineChecksum ?? '')) {
    throw new Error('deployment genesis metadata is invalid');
  }
}
process.stdout.write(`${target.kind}\n${target.unitId ?? ''}\n${target.mode ?? ''}\n`);
if (metadata.deploymentBootstrap) {
  process.stdout.write(`${metadata.deploymentBootstrap.baselineSha}\n${metadata.deploymentBootstrap.legacy.cnbCommitSha}\n`);
}
NODE
)"
deployment_target_kind="$(printf '%s\n' "$metadata_values" | sed -n '1p')"
deployment_target_unit="$(printf '%s\n' "$metadata_values" | sed -n '2p')"
deployment_target_mode="$(printf '%s\n' "$metadata_values" | sed -n '3p')"
bootstrap_baseline="$(printf '%s\n' "$metadata_values" | sed -n '4p')"
bootstrap_legacy_commit="$(printf '%s\n' "$metadata_values" | sed -n '5p')"
if [ -n "$bootstrap_baseline" ]; then
  if [ "$PRINT_COMMAND_ONLY" = "1" ]; then
    echo "[错误] production bootstrap metadata 禁止 --print-command"
    exit 1
  fi
  bootstrap_legacy_ref="refs/tags/workspace-production-bootstrap-${bootstrap_baseline:0:12}"
  bootstrap_anchor="$(git ls-remote "$CNB_REMOTE" "$bootstrap_legacy_ref" | awk '{print $1}')"
  if [ "$bootstrap_anchor" != "$bootstrap_legacy_commit" ]; then
    echo "[错误] production bootstrap legacy CNB anchor 缺失或与 metadata 不一致"
    exit 1
  fi
fi

cnb_release_branch="${CNB_RELEASE_BRANCH:-cnb-release}"

echo "==> 创建/重置 $cnb_release_branch 分支..."
git branch -D "$cnb_release_branch" 2>/dev/null || true
git checkout -b "$cnb_release_branch"

echo "==> 注入真实 CNB CD 配置..."
render_args=(--input "$CNB_REAL_CNB_YML" --output .cnb.yml)
if [ "$deployment_target_kind" = "unit" ]; then
  render_args+=(--deploy-unit "$deployment_target_unit" --deploy-unit-mode "$deployment_target_mode")
fi
node "$SCRIPT_DIR/render-cnb-release-config.mjs" "${render_args[@]}"
cp "$METADATA_FILE" .cnb-release.json
chmod 600 .cnb-release.json
git add .cnb.yml
git add -f .cnb-release.json
injection_files="$(git diff --cached --name-only | LC_ALL=C sort)"
if [ "$injection_files" != $'.cnb-release.json\n.cnb.yml' ]; then
  echo "[错误] CNB injection commit 只能修改 .cnb.yml 与 .cnb-release.json"
  printf '%s\n' "$injection_files"
  exit 1
fi
git commit --no-verify -m "chore(cnb): inject release metadata for ${canonical_sha:0:12}" --quiet
if [ "$(git rev-parse HEAD^)" != "$canonical_sha" ]; then
  echo "[错误] CNB injection commit parent 不是 canonical source SHA"
  exit 1
fi

echo "==> 推送 $cnb_release_branch 到 CNB..."
git push --no-verify -f "$CNB_REMOTE" "$cnb_release_branch"

release_sha=$(git rev-parse HEAD)
echo ""
echo "==> CNB 发布分支已推送: $cnb_release_branch ($release_sha)"

cnb_start_build_cmd=(
  cnb build start-build
  --repo "${CNB_REPO:?CNB_REPO not set in $OPS_ENV_FILE}"
  --branch "$cnb_release_branch"
  --sha "$release_sha"
  --event "${CNB_DEPLOY_EVENT:-api_trigger_manual}"
  --title "deploy ${deployment_target_unit:-monolith} ${deployment_target_mode:-full} ${canonical_sha:0:8} via ${release_sha:0:8}"
  --sync false
  --verbose
)

printf -v cnb_start_build_display "%q " "${cnb_start_build_cmd[@]}"
echo "==> CNB 触发命令:"
echo "  $cnb_start_build_display"
echo ""

if [ "$PRINT_COMMAND_ONLY" = "1" ]; then
  echo "==> --print-command：已更新 CNB release ref，但未触发 build/deploy。"
else
  if ! command -v cnb >/dev/null 2>&1; then
    echo "[错误] 未找到 cnb CLI，无法触发部署。可先安装/登录 cnb，或加 --print-command 只打印命令。"
    exit 1
  fi
  echo "==> 调用 CNB CLI 触发部署..."
  TRIGGER_RESPONSE_FILE="$(mktemp)"
  if ! "${cnb_start_build_cmd[@]}" > "$TRIGGER_RESPONSE_FILE"; then
    cat "$TRIGGER_RESPONSE_FILE"
    exit 1
  fi
  cat "$TRIGGER_RESPONSE_FILE"
  if [ -z "$RESULT_FILE" ]; then
    INTERNAL_RESULT_FILE="$(mktemp)"
    RESULT_FILE="$INTERNAL_RESULT_FILE"
  fi
  node scripts/ci/cnb-build-state.mjs parse-trigger \
    --input "$TRIGGER_RESPONSE_FILE" \
    --output "$RESULT_FILE" >/dev/null
fi

echo "==> 完成。公共分支仍保留占位 .cnb.yml。"
