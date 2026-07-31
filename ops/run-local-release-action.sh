#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACTION="${1:-}"
METADATA_FILE="${2:-}"

case "$ACTION" in
  validate|deploy) ;;
  *) echo "用法: run-local-release-action.sh validate|deploy METADATA_FILE" >&2; exit 2 ;;
esac
: "${RELEASE_SOURCE_DIR:?RELEASE_SOURCE_DIR is required}"
: "${RELEASE_SOURCE_SHA:?RELEASE_SOURCE_SHA is required}"
: "${RELEASE_SOURCE_TREE:?RELEASE_SOURCE_TREE is required}"
: "${RELEASE_VALIDATION_BASE_SHA:?RELEASE_VALIDATION_BASE_SHA is required}"
: "${CNB_REAL_CNB_YML:?CNB_REAL_CNB_YML is required}"
[ -f "$METADATA_FILE" ] || { echo "[错误] release metadata 不存在: $METADATA_FILE" >&2; exit 1; }

mkdir -p "$RELEASE_SOURCE_DIR/.local-release-worktrees"
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
process.stdout.write(`${target?.unitId ?? ''}\n${target?.mode ?? 'shadow'}\n`);
NODE
)"
deploy_unit_id="$(printf '%s\n' "$metadata_values" | sed -n '1p')"
deploy_unit_mode="$(printf '%s\n' "$metadata_values" | sed -n '2p')"

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
git -C "$injection_worktree" -c user.name=Workspace-Release -c user.email=release@workspace.local \
  commit --no-verify -m "release: $ACTION ${RELEASE_SOURCE_SHA:0:12}" >/dev/null

if [ "$ACTION" = "validate" ]; then
  export CI=1
  if [ -d "$RELEASE_SOURCE_DIR/node_modules" ]; then
    mkdir "$injection_worktree/node_modules"
    if [ ! -L "$RELEASE_SOURCE_DIR/node_modules" ] && \
      [ "$(stat -c %d "$RELEASE_SOURCE_DIR/node_modules")" = "$(stat -c %d "$injection_worktree/node_modules")" ]; then
      cp -al "$RELEASE_SOURCE_DIR/node_modules/." "$injection_worktree/node_modules/"
    else
      cp -a "$RELEASE_SOURCE_DIR/node_modules/." "$injection_worktree/node_modules/"
    fi
  else
    (cd "$injection_worktree" && npm ci --no-audit --fund=false --loglevel=error)
  fi
  if [ -e "$RELEASE_SOURCE_DIR/.env" ] && [ ! -e "$injection_worktree/.env" ]; then
    cp "$RELEASE_SOURCE_DIR/.env" "$injection_worktree/.env"
    chmod 600 "$injection_worktree/.env"
  fi
fi
if [ "$ACTION" = "deploy" ] && [ -z "${KEY_CONTENT:-}" ] && [ -n "${KEY:-}" ] && [ -f "$KEY" ]; then
  KEY_CONTENT="$(<"$KEY")"
  export KEY_CONTENT
fi

export RELEASE_ACTION="$ACTION"
export RELEASE_VALIDATION_RUNTIME=local
export RELEASE_SOURCE_SHA RELEASE_SOURCE_TREE RELEASE_VALIDATION_BASE_SHA
export DEPLOY_UNIT_ID="$deploy_unit_id" DEPLOY_UNIT_MODE="$deploy_unit_mode"
export CNB_RELEASE_ARTIFACT_CACHE_ROOT="$RELEASE_SOURCE_DIR/.cache/release-artifacts"
export EXPECTED_CNB_REPOSITORY="${EXPECTED_CNB_REPOSITORY:-${CNB_REPO:-}}"
export RELEASE_SOURCE_BRANCH="${RELEASE_BRANCH:-release}"

cd "$injection_worktree"
bash ./ops/run-cnb-release-stage.sh release.gate -- bash ./ops/run-cnb-release-gate.sh
bash ./ops/run-cnb-release-stage.sh artifact.build -- bash ./ops/build-cnb-release-target.sh
if [ "$ACTION" = "validate" ]; then
  echo "==> 本地 validate 完成；制品已冻结到 $CNB_RELEASE_ARTIFACT_CACHE_ROOT"
  exit 0
fi
bash ./ops/run-cnb-release-stage.sh server.deploy -- bash ./ops/deploy-cnb-release-target.sh
