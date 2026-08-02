#!/usr/bin/env bash
set -uo pipefail

if ! SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; then
  echo "[错误] 无法解析 local release adapter 目录" >&2
  exit 1
fi
ACTION="${1:-}"
METADATA_FILE="${2:-}"

RELEASE_SOURCE_DIR="${RELEASE_SOURCE_DIR:-}"
RELEASE_SOURCE_SHA="${RELEASE_SOURCE_SHA:-}"
RELEASE_SOURCE_TREE="${RELEASE_SOURCE_TREE:-}"
RELEASE_CONTENT_DIGEST="${RELEASE_CONTENT_DIGEST:-}"
RELEASE_VALIDATION_BASE_SHA="${RELEASE_VALIDATION_BASE_SHA:-}"
RELEASE_CONFIGURATION_DIGEST="${RELEASE_CONFIGURATION_DIGEST:-}"
CNB_REAL_CNB_YML="${CNB_REAL_CNB_YML:-}"
OPS_ENV_FILE="${OPS_ENV_FILE:-}"

preflight_failed=()
preflight_blocked=()
preflight_fail() { preflight_failed+=("$1"); }
preflight_block() { preflight_blocked+=("$1"); }
require_preflight_value() {
  local name="$1" value="${!1:-}"
  [ -n "$value" ] || preflight_fail "input.$name"
}

[ "$ACTION" = deploy ] || preflight_fail "input.action"
for name in RELEASE_SOURCE_DIR RELEASE_SOURCE_SHA RELEASE_SOURCE_TREE RELEASE_CONTENT_DIGEST \
  RELEASE_VALIDATION_BASE_SHA RELEASE_CONFIGURATION_DIGEST CNB_REAL_CNB_YML OPS_ENV_FILE; do
  require_preflight_value "$name"
done
if [ -n "$RELEASE_SOURCE_DIR" ]; then
  [ -d "$RELEASE_SOURCE_DIR" ] || preflight_fail "input.release-source-dir"
else
  preflight_block "git.controller-identity:input.release-source-dir"
fi
[ -n "$CNB_REAL_CNB_YML" ] && [ -f "$CNB_REAL_CNB_YML" ] || preflight_fail "input.cnb-config"
[ -n "$METADATA_FILE" ] && [ -f "$METADATA_FILE" ] || preflight_fail "input.release-metadata"
[ -n "$OPS_ENV_FILE" ] && [ -f "$OPS_ENV_FILE" ] || preflight_fail "input.ops-environment"

metadata_values=""
metadata_inputs_ready=1
for value in "$METADATA_FILE" "$RELEASE_SOURCE_SHA" "$RELEASE_SOURCE_TREE" "$RELEASE_CONTENT_DIGEST"; do
  [ -n "$value" ] || metadata_inputs_ready=0
done
if [ "$metadata_inputs_ready" = 1 ] && [ -f "$METADATA_FILE" ]; then
  if ! metadata_values="$(node - "$METADATA_FILE" <<'NODE'
const metadata = JSON.parse(require('node:fs').readFileSync(process.argv[2], 'utf8'));
if (metadata.schemaVersion !== 3) throw new Error('local release metadata schema is invalid');
if (metadata.transport?.kind !== 'local') throw new Error('local release metadata must declare local transport');
const target = metadata.deployment?.target;
const ready = metadata.releaseReady;
const controller = metadata.controllerReady;
if (!/^ci-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}-[0-9a-f]{8}$/.test(ready?.runId ?? '')) throw new Error('release metadata must contain a Ready CI run');
if (metadata.source?.commitSha !== process.env.RELEASE_SOURCE_SHA
  || metadata.source?.treeSha !== process.env.RELEASE_SOURCE_TREE
  || metadata.source?.contentDigest !== process.env.RELEASE_CONTENT_DIGEST) {
  throw new Error('local release metadata does not match Application Ready identity');
}
if (controller?.readySource !== metadata.source.commitSha
  || !/^[0-9a-f]{40}$/.test(controller?.controller?.sourceSha ?? '')
  || !/^[0-9a-f]{40}$/.test(controller?.controller?.treeId ?? '')
  || !/^[0-9a-f]{64}$/.test(controller?.controller?.controlDigest ?? '')
  || !/^[0-9a-f]{64}$/.test(controller?.receiptDigest ?? '')) {
  throw new Error('local release metadata Controller Ready identity is invalid');
}
process.stdout.write(`${target?.unitId ?? ''}\n${target?.mode ?? 'activate'}\n${ready.runId}\n${controller.controller.sourceSha}\n${controller.controller.treeId}\n${controller.controller.controlDigest}\n${controller.receiptDigest}\n`);
NODE
  )"; then
    preflight_fail "metadata.identity"
  fi
else
  preflight_block "metadata.identity:input.release-metadata"
fi

deploy_unit_id="$(printf '%s\n' "$metadata_values" | sed -n '1p')"
deploy_unit_mode="$(printf '%s\n' "$metadata_values" | sed -n '2p')"
release_run_id="$(printf '%s\n' "$metadata_values" | sed -n '3p')"
RELEASE_CONTROLLER_SOURCE_SHA="$(printf '%s\n' "$metadata_values" | sed -n '4p')"
RELEASE_CONTROLLER_TREE_ID="$(printf '%s\n' "$metadata_values" | sed -n '5p')"
RELEASE_CONTROLLER_CONTROL_DIGEST="$(printf '%s\n' "$metadata_values" | sed -n '6p')"
RELEASE_CONTROLLER_RECEIPT_DIGEST="$(printf '%s\n' "$metadata_values" | sed -n '7p')"

if [ -n "$RELEASE_CONTROLLER_SOURCE_SHA" ] && [ -d "$RELEASE_SOURCE_DIR" ]; then
  controller_tree=""
  if ! controller_tree="$(git -C "$RELEASE_SOURCE_DIR" rev-parse "$RELEASE_CONTROLLER_SOURCE_SHA^{tree}")"; then
    preflight_fail "git.controller-source"
  elif [ "$controller_tree" != "$RELEASE_CONTROLLER_TREE_ID" ]; then
    preflight_fail "git.controller-tree"
  fi
else
  preflight_block "git.controller-identity:metadata.identity"
fi

persistent_check_result_cache="$RELEASE_SOURCE_DIR/.cache/release-check-results"
persistent_evidence_root="$RELEASE_SOURCE_DIR/.cache/release-artifacts/evidence/$RELEASE_CONTENT_DIGEST"
source_artifact_preflight_file="$persistent_evidence_root/artifact-preflight-${deploy_unit_id:-monolith}-${deploy_unit_mode:-activate}-$release_run_id.json"
if [ -n "$release_run_id" ] && [ -d "$RELEASE_SOURCE_DIR" ]; then
  ready_files=(
    "$RELEASE_SOURCE_DIR/.cache/release-check/release-artifact.json"
    "$source_artifact_preflight_file"
  )
  if [ -z "$deploy_unit_id" ]; then
    ready_files+=(
      "$RELEASE_SOURCE_DIR/.next/workspace-standalone.tgz"
      "$RELEASE_SOURCE_DIR/.next/workspace-standalone.manifest.json"
      "$RELEASE_SOURCE_DIR/.cache/release-check/deploy-graph.json"
    )
  else
    source_unit_root="$RELEASE_SOURCE_DIR/.cache/deploy-units/$deploy_unit_id"
    ready_files+=(
      "$source_unit_root/$deploy_unit_id-standalone.tgz"
      "$source_unit_root/$deploy_unit_id-standalone.manifest.json"
      "$source_unit_root/deploy-unit-contract.json"
      "$source_unit_root/deploy-graph.json"
    )
  fi
  for file in "${ready_files[@]}"; do
    [ -f "$file" ] || preflight_fail "ready-input:$file"
  done
else
  preflight_block "ready-inputs:metadata.identity"
fi

if [ -f "$OPS_ENV_FILE" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$OPS_ENV_FILE"
  ops_env_status=$?
  set +a
  set +e
  if [ "$ops_env_status" -ne 0 ]; then
    preflight_fail "environment.load"
  else
    [ -n "${SERVER:-}" ] || preflight_fail "environment.SERVER"
    [ -n "${REMOTE_DIR:-}" ] || preflight_fail "environment.REMOTE_DIR"
    [ -n "${HEALTHCHECK_URL:-}" ] || preflight_fail "environment.HEALTHCHECK_URL"
    if [ -z "${KEY_CONTENT:-}" ] && { [ -z "${KEY:-}" ] || [ ! -f "$KEY" ]; }; then
      preflight_fail "environment.deploy-key"
    fi
  fi
else
  preflight_block "environment.runtime:input.ops-environment"
fi

if [ "${#preflight_failed[@]}" -gt 0 ] || [ "${#preflight_blocked[@]}" -gt 0 ]; then
  echo "[错误] Local deploy adapter preflight 汇总: failed=${#preflight_failed[@]} blocked=${#preflight_blocked[@]}; production mutation=0" >&2
  for item in "${preflight_failed[@]}"; do echo "  failed: $item" >&2; done
  for item in "${preflight_blocked[@]}"; do echo "  blocked: $item" >&2; done
  exit 1
fi

if ! mkdir -p "$RELEASE_SOURCE_DIR/.local-release-worktrees"; then
  echo "[错误] 无法创建 local release worktree 根目录" >&2
  exit 1
fi
if ! temporary_root="$(mktemp -d "$RELEASE_SOURCE_DIR/.local-release-worktrees/action.XXXXXX")"; then
  echo "[错误] 无法创建 local release 临时目录" >&2
  exit 1
fi
injection_worktree="$temporary_root/release-injection"
cleanup() {
  local exit_code=$?
  cd "$RELEASE_SOURCE_DIR"
  git -C "$RELEASE_SOURCE_DIR" worktree remove --force "$injection_worktree" >/dev/null 2>&1 || true
  rm -rf "$temporary_root"
  return "$exit_code"
}
trap cleanup EXIT

if ! git -C "$RELEASE_SOURCE_DIR" worktree add --detach "$injection_worktree" "$RELEASE_CONTROLLER_SOURCE_SHA" >/dev/null; then
  echo "[错误] 无法创建 controller injection worktree" >&2
  exit 1
fi
if ! injection_tree="$(git -C "$injection_worktree" rev-parse 'HEAD^{tree}')" \
  || [ "$injection_tree" != "$RELEASE_CONTROLLER_TREE_ID" ]; then
  echo "[错误] Controller Ready source/tree 不一致" >&2
  exit 1
fi
render_args=(
  --input "$CNB_REAL_CNB_YML"
  --output "$injection_worktree/.cnb.yml"
  --release-action "$ACTION"
  --validation-base "$RELEASE_VALIDATION_BASE_SHA"
)
[ -z "$deploy_unit_id" ] || render_args+=(--deploy-unit "$deploy_unit_id" --deploy-unit-mode "$deploy_unit_mode")
if ! node "$SCRIPT_DIR/render-cnb-release-config.mjs" "${render_args[@]}"; then
  echo "[错误] 无法生成 local release adapter 配置" >&2
  exit 1
fi
if ! cp "$METADATA_FILE" "$injection_worktree/.cnb-release.json" \
  || ! chmod 600 "$injection_worktree/.cnb.yml" "$injection_worktree/.cnb-release.json" \
  || ! git -C "$injection_worktree" add -f .cnb.yml .cnb-release.json; then
  echo "[错误] 无法安装 local release adapter 输入" >&2
  exit 1
fi
if ! source_commit_date="$(git -C "$RELEASE_SOURCE_DIR" show -s --format=%cI "$RELEASE_CONTROLLER_SOURCE_SHA")"; then
  echo "[错误] 无法读取 controller commit 时间" >&2
  exit 1
fi
GIT_AUTHOR_DATE="$source_commit_date" GIT_COMMITTER_DATE="$source_commit_date" \
  git -C "$injection_worktree" -c user.name=Workspace-Release -c user.email=release@workspace.local \
  commit --no-verify -m "release: $ACTION ${RELEASE_SOURCE_SHA:0:12} via ${RELEASE_CONTROLLER_SOURCE_SHA:0:12}" >/dev/null
commit_status=$?
if [ "$commit_status" -ne 0 ]; then
  echo "[错误] 无法提交 local release adapter 快照" >&2
  exit "$commit_status"
fi
if [ "$ACTION" = "deploy" ] && [ -z "${KEY_CONTENT:-}" ] && [ -n "${KEY:-}" ] && [ -f "$KEY" ]; then
  KEY_CONTENT="$(<"$KEY")"
  export KEY_CONTENT
fi

export RELEASE_ACTION="$ACTION"
export RELEASE_VALIDATION_RUNTIME=local
export RELEASE_SOURCE_SHA RELEASE_SOURCE_TREE RELEASE_CONTENT_DIGEST RELEASE_VALIDATION_BASE_SHA
export RELEASE_CONTROLLER_SOURCE_SHA RELEASE_CONTROLLER_TREE_ID RELEASE_CONTROLLER_CONTROL_DIGEST RELEASE_CONTROLLER_RECEIPT_DIGEST
export DEPLOY_UNIT_ID="$deploy_unit_id" DEPLOY_UNIT_MODE="$deploy_unit_mode"
export CNB_RELEASE_ARTIFACT_CACHE_ROOT="$RELEASE_SOURCE_DIR/.cache/release-artifacts"
export RELEASE_EVIDENCE_ROOT="$persistent_evidence_root"
export RELEASE_SOURCE_VALIDATION_RECEIPT_FILE="$persistent_evidence_root/source-validation-${deploy_unit_id:-monolith}-$release_run_id.json"
export RELEASE_SOURCE_RESULT_FILE="$persistent_evidence_root/source-$release_run_id.json"
export CHECK_TASK_GRAPH_FILE="$RELEASE_SOURCE_DIR/.cache/release-task-graphs/$release_run_id.json"
export RELEASE_ARTIFACT_REHEARSAL_FILE="$persistent_evidence_root/rehearsal-${deploy_unit_id:-monolith}-${deploy_unit_mode:-activate}-$release_run_id-${RELEASE_CONFIGURATION_DIGEST}.json"
export EXPECTED_CNB_REPOSITORY="${EXPECTED_CNB_REPOSITORY:-${CNB_REPO:-}}"
export RELEASE_SOURCE_BRANCH="${RELEASE_BRANCH:-release}"
export RELEASE_CI_RUN_ID="$release_run_id"
export RELEASE_PROOF_ROOT="$RELEASE_SOURCE_DIR"

if ! cd "$injection_worktree"; then
  echo "[错误] 无法进入 controller injection worktree" >&2
  exit 1
fi
link_ready_file() {
  local source="$1" target="$2"
  [ -f "$source" ] || { echo "[错误] Ready Artifact 文件缺失: $source" >&2; return 1; }
  if ! mkdir -p "$(dirname "$target")" || ! rm -f "$target" || ! ln "$source" "$target"; then
    echo "[错误] 无法 hardlink Ready Artifact: $source" >&2
    return 1
  fi
}
if ! link_ready_file "$RELEASE_SOURCE_DIR/.cache/release-check/release-artifact.json" \
  "$injection_worktree/.cache/release-check/release-artifact.json"; then exit 1; fi
RELEASE_ARTIFACT_PREFLIGHT_RECEIPT_FILE="$injection_worktree/.cache/release-artifacts/evidence/$RELEASE_CONTENT_DIGEST/$(basename "$source_artifact_preflight_file")"
export RELEASE_ARTIFACT_PREFLIGHT_RECEIPT_FILE
if ! link_ready_file "$source_artifact_preflight_file" \
  "$RELEASE_ARTIFACT_PREFLIGHT_RECEIPT_FILE"; then exit 1; fi
if [ -z "$deploy_unit_id" ]; then
  if ! link_ready_file "$RELEASE_SOURCE_DIR/.next/workspace-standalone.tgz" "$injection_worktree/.next/workspace-standalone.tgz" \
    || ! link_ready_file "$RELEASE_SOURCE_DIR/.next/workspace-standalone.manifest.json" "$injection_worktree/.next/workspace-standalone.manifest.json" \
    || ! link_ready_file "$RELEASE_SOURCE_DIR/.cache/release-check/deploy-graph.json" "$injection_worktree/.cache/release-check/deploy-graph.json"; then
    exit 1
  fi
else
  source_unit_root="$RELEASE_SOURCE_DIR/.cache/deploy-units/$deploy_unit_id"
  target_unit_root="$injection_worktree/.cache/deploy-units/$deploy_unit_id"
  for file in "$deploy_unit_id-standalone.tgz" "$deploy_unit_id-standalone.manifest.json" deploy-unit-contract.json deploy-graph.json; do
    if ! link_ready_file "$source_unit_root/$file" "$target_unit_root/$file"; then exit 1; fi
  done
fi
echo "==> Ready Artifact 以 immutable hardlink 交给 deploy；未复制、未构建"
bash ./ops/run-cnb-release-stage.sh server.deploy -- bash ./ops/deploy-cnb-release-target.sh
deploy_status=$?
if [ "$deploy_status" -ne 0 ]; then
  echo "[错误] local release deploy adapter 失败: status=$deploy_status" >&2
  exit "$deploy_status"
fi
