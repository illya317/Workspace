#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACTION="${1:-}"
METADATA_FILE="${2:-}"

[ "$ACTION" = deploy ] || { echo "用法: run-local-release-action.sh deploy METADATA_FILE" >&2; exit 2; }
: "${RELEASE_SOURCE_DIR:?RELEASE_SOURCE_DIR is required}"
: "${RELEASE_SOURCE_SHA:?RELEASE_SOURCE_SHA is required}"
: "${RELEASE_SOURCE_TREE:?RELEASE_SOURCE_TREE is required}"
: "${RELEASE_CONTENT_DIGEST:?RELEASE_CONTENT_DIGEST is required}"
: "${RELEASE_VALIDATION_BASE_SHA:?RELEASE_VALIDATION_BASE_SHA is required}"
: "${CNB_REAL_CNB_YML:?CNB_REAL_CNB_YML is required}"
[ -f "$METADATA_FILE" ] || { echo "[错误] release metadata 不存在: $METADATA_FILE" >&2; exit 1; }

mkdir -p "$RELEASE_SOURCE_DIR/.local-release-worktrees"
persistent_check_result_cache="$RELEASE_SOURCE_DIR/.cache/release-check-results"
persistent_evidence_root="$RELEASE_SOURCE_DIR/.cache/release-artifacts/evidence/$RELEASE_CONTENT_DIGEST"
temporary_root="$(mktemp -d "$RELEASE_SOURCE_DIR/.local-release-worktrees/action.XXXXXX")"
injection_worktree="$temporary_root/release-injection"
cleanup() {
  local exit_code=$?
  cd "$RELEASE_SOURCE_DIR"
  git -C "$RELEASE_SOURCE_DIR" worktree remove --force "$injection_worktree" >/dev/null 2>&1 || true
  rm -rf "$temporary_root"
  return "$exit_code"
}
trap cleanup EXIT

metadata_values="$(node - "$METADATA_FILE" <<'NODE'
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
)"
deploy_unit_id="$(printf '%s\n' "$metadata_values" | sed -n '1p')"
deploy_unit_mode="$(printf '%s\n' "$metadata_values" | sed -n '2p')"
release_run_id="$(printf '%s\n' "$metadata_values" | sed -n '3p')"
RELEASE_CONTROLLER_SOURCE_SHA="$(printf '%s\n' "$metadata_values" | sed -n '4p')"
RELEASE_CONTROLLER_TREE_ID="$(printf '%s\n' "$metadata_values" | sed -n '5p')"
RELEASE_CONTROLLER_CONTROL_DIGEST="$(printf '%s\n' "$metadata_values" | sed -n '6p')"
RELEASE_CONTROLLER_RECEIPT_DIGEST="$(printf '%s\n' "$metadata_values" | sed -n '7p')"

git -C "$RELEASE_SOURCE_DIR" worktree add --detach "$injection_worktree" "$RELEASE_CONTROLLER_SOURCE_SHA" >/dev/null
[ "$(git -C "$injection_worktree" rev-parse 'HEAD^{tree}')" = "$RELEASE_CONTROLLER_TREE_ID" ] \
  || { echo "[错误] Controller Ready source/tree 不一致" >&2; exit 1; }
render_args=(
  --input "$CNB_REAL_CNB_YML"
  --output "$injection_worktree/.cnb.yml"
  --release-action "$ACTION"
  --validation-base "$RELEASE_VALIDATION_BASE_SHA"
)
[ -z "$deploy_unit_id" ] || render_args+=(--deploy-unit "$deploy_unit_id" --deploy-unit-mode "$deploy_unit_mode")
node "$SCRIPT_DIR/render-cnb-release-config.mjs" "${render_args[@]}"
cp "$METADATA_FILE" "$injection_worktree/.cnb-release.json"
chmod 600 "$injection_worktree/.cnb.yml" "$injection_worktree/.cnb-release.json"
git -C "$injection_worktree" add -f .cnb.yml .cnb-release.json
source_commit_date="$(git -C "$RELEASE_SOURCE_DIR" show -s --format=%cI "$RELEASE_CONTROLLER_SOURCE_SHA")"
GIT_AUTHOR_DATE="$source_commit_date" GIT_COMMITTER_DATE="$source_commit_date" \
  git -C "$injection_worktree" -c user.name=Workspace-Release -c user.email=release@workspace.local \
  commit --no-verify -m "release: $ACTION ${RELEASE_SOURCE_SHA:0:12} via ${RELEASE_CONTROLLER_SOURCE_SHA:0:12}" >/dev/null

if [ "$ACTION" = "deploy" ]; then
  : "${OPS_ENV_FILE:?OPS_ENV_FILE is required for local deploy}"
  [ -f "$OPS_ENV_FILE" ] || { echo "[错误] local deploy 环境文件不存在: $OPS_ENV_FILE" >&2; exit 1; }
  set -a
  # shellcheck source=/dev/null
  source "$OPS_ENV_FILE"
  set +a
  : "${SERVER:?SERVER is required for local deploy}"
  : "${REMOTE_DIR:?REMOTE_DIR is required for local deploy}"
  : "${HEALTHCHECK_URL:?HEALTHCHECK_URL is required for local deploy}"
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
source_artifact_preflight_file="$persistent_evidence_root/artifact-preflight-${deploy_unit_id:-monolith}-${deploy_unit_mode:-activate}-$release_run_id.json"
export RELEASE_ARTIFACT_REHEARSAL_FILE="$persistent_evidence_root/rehearsal-${deploy_unit_id:-monolith}-${deploy_unit_mode:-activate}-$release_run_id-${RELEASE_CONFIGURATION_DIGEST}.json"
export EXPECTED_CNB_REPOSITORY="${EXPECTED_CNB_REPOSITORY:-${CNB_REPO:-}}"
export RELEASE_SOURCE_BRANCH="${RELEASE_BRANCH:-release}"
export RELEASE_CI_RUN_ID="$release_run_id"
export RELEASE_PROOF_ROOT="$RELEASE_SOURCE_DIR"

cd "$injection_worktree"
link_ready_file() {
  local source="$1" target="$2"
  [ -f "$source" ] || { echo "[错误] Ready Artifact 文件缺失: $source" >&2; exit 1; }
  mkdir -p "$(dirname "$target")"
  rm -f "$target"
  ln "$source" "$target"
}
link_ready_file "$RELEASE_SOURCE_DIR/.cache/release-check/release-artifact.json" \
  "$injection_worktree/.cache/release-check/release-artifact.json"
RELEASE_ARTIFACT_PREFLIGHT_RECEIPT_FILE="$injection_worktree/.cache/release-artifacts/evidence/$RELEASE_CONTENT_DIGEST/$(basename "$source_artifact_preflight_file")"
export RELEASE_ARTIFACT_PREFLIGHT_RECEIPT_FILE
link_ready_file "$source_artifact_preflight_file" \
  "$RELEASE_ARTIFACT_PREFLIGHT_RECEIPT_FILE"
if [ -z "$deploy_unit_id" ]; then
  link_ready_file "$RELEASE_SOURCE_DIR/.next/workspace-standalone.tgz" "$injection_worktree/.next/workspace-standalone.tgz"
  link_ready_file "$RELEASE_SOURCE_DIR/.next/workspace-standalone.manifest.json" "$injection_worktree/.next/workspace-standalone.manifest.json"
  link_ready_file "$RELEASE_SOURCE_DIR/.cache/release-check/deploy-graph.json" "$injection_worktree/.cache/release-check/deploy-graph.json"
else
  source_unit_root="$RELEASE_SOURCE_DIR/.cache/deploy-units/$deploy_unit_id"
  target_unit_root="$injection_worktree/.cache/deploy-units/$deploy_unit_id"
  for file in "$deploy_unit_id-standalone.tgz" "$deploy_unit_id-standalone.manifest.json" deploy-unit-contract.json deploy-graph.json; do
    link_ready_file "$source_unit_root/$file" "$target_unit_root/$file"
  done
fi
echo "==> Ready Artifact 以 immutable hardlink 交给 deploy；未复制、未构建"
bash ./ops/run-cnb-release-stage.sh server.deploy -- bash ./ops/deploy-cnb-release-target.sh
