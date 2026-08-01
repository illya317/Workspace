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
  git -C "$RELEASE_SOURCE_DIR" worktree remove --force "$injection_worktree" >/dev/null 2>&1 || true
  rm -rf "$temporary_root"
  return "$exit_code"
}
trap cleanup EXIT

metadata_values="$(node - "$METADATA_FILE" <<'NODE'
const metadata = JSON.parse(require('node:fs').readFileSync(process.argv[2], 'utf8'));
if (metadata.transport?.kind !== 'local') throw new Error('local release metadata must declare local transport');
const target = metadata.deployment?.target;
const ready = metadata.releaseReady;
if (!/^ci-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}-[0-9a-f]{8}$/.test(ready?.runId ?? '')) throw new Error('release metadata must contain a Ready CI run');
process.stdout.write(`${target?.unitId ?? ''}\n${target?.mode ?? 'activate'}\n${ready.runId}\n`);
NODE
)"
deploy_unit_id="$(printf '%s\n' "$metadata_values" | sed -n '1p')"
deploy_unit_mode="$(printf '%s\n' "$metadata_values" | sed -n '2p')"
release_run_id="$(printf '%s\n' "$metadata_values" | sed -n '3p')"

git -C "$RELEASE_SOURCE_DIR" worktree add --detach "$injection_worktree" "$RELEASE_SOURCE_SHA" >/dev/null
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
source_commit_date="$(git -C "$RELEASE_SOURCE_DIR" show -s --format=%cI "$RELEASE_SOURCE_SHA")"
GIT_AUTHOR_DATE="$source_commit_date" GIT_COMMITTER_DATE="$source_commit_date" \
  git -C "$injection_worktree" -c user.name=Workspace-Release -c user.email=release@workspace.local \
  commit --no-verify -m "release: $ACTION ${RELEASE_SOURCE_SHA:0:12}" >/dev/null

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
export DEPLOY_UNIT_ID="$deploy_unit_id" DEPLOY_UNIT_MODE="$deploy_unit_mode"
export CNB_RELEASE_ARTIFACT_CACHE_ROOT="$RELEASE_SOURCE_DIR/.cache/release-artifacts"
export RELEASE_EVIDENCE_ROOT="$persistent_evidence_root"
export RELEASE_SOURCE_VALIDATION_RECEIPT_FILE="$persistent_evidence_root/source-validation.json"
export RELEASE_SOURCE_RESULT_FILE="$persistent_evidence_root/source-$release_run_id.json"
export CHECK_TASK_GRAPH_FILE="$RELEASE_SOURCE_DIR/.cache/release-task-graphs/$release_run_id.json"
export RELEASE_ARTIFACT_REHEARSAL_FILE="$persistent_evidence_root/rehearsal-${deploy_unit_id:-monolith}-${RELEASE_CONFIGURATION_DIGEST}.json"
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
