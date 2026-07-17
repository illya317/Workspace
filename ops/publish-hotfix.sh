#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
if [ "${WORKSPACE_REPO_RUNTIME_READY:-0}" != "1" ]; then
  exec "$REPOSITORY_ROOT/scripts/runtime/run-with-repo-node.sh" "$0" "$@"
fi
OPS_ENV_FILE="${OPS_ENV_FILE:-$SCRIPT_DIR/.env}"
set -a
# shellcheck source=/dev/null
source "$OPS_ENV_FILE"
set +a

: "${SOURCE_DIR:?SOURCE_DIR not set in $OPS_ENV_FILE}"
: "${SERVER:?SERVER not set in $OPS_ENV_FILE}"
: "${REMOTE_DIR:?REMOTE_DIR not set in $OPS_ENV_FILE}"
: "${HEALTHCHECK_URL:?HEALTHCHECK_URL not set in $OPS_ENV_FILE}"

REMOTE_WORKSPACE_CONFIG_DIR="${REMOTE_WORKSPACE_CONFIG_DIR:-$REMOTE_DIR/.workspace}"
REMOTE_AGENT_SOURCE_ROOT="${REMOTE_AGENT_SOURCE_ROOT:-$REMOTE_DIR/source}"
REMOTE_AGENT_SOURCE_DIR="${REMOTE_AGENT_SOURCE_DIR:-$REMOTE_AGENT_SOURCE_ROOT/Workspace}"
REMOTE_HOTFIX_BUILD_ROOT="${REMOTE_HOTFIX_BUILD_ROOT:-$REMOTE_DIR/.hotfix-builds}"
REMOTE_HOTFIX_CACHE_ROOT="${REMOTE_HOTFIX_CACHE_ROOT:-$REMOTE_DIR/.hotfix-cache}"
EXPECTED_CNB_REPOSITORY="${CNB_REPO:-${EXPECTED_CNB_REPOSITORY:-illya317/Workspace}}"
RELEASE_SOURCE_BRANCH="${RELEASE_BRANCH:-main}"
HOTFIX_SCOPE_POLICY="${HOTFIX_SCOPE_POLICY:-off}"
HOTFIX_ALLOWED_RISK_CLASSES="${HOTFIX_ALLOWED_RISK_CLASSES:-C0,C1,C2}"
HOTFIX_NODE_IMAGE="${HOTFIX_NODE_IMAGE:-node:24-bookworm}"
HOTFIX_BUILD_CPUS="${HOTFIX_BUILD_CPUS:-3}"
HOTFIX_BUILD_MEMORY="${HOTFIX_BUILD_MEMORY:-10g}"
HOTFIX_RUN_LOCAL_CHECKS="${HOTFIX_RUN_LOCAL_CHECKS:-1}"

usage() {
  cat <<'EOF'
用法:
  OPS_ENV_FILE=/path/to/ops/.env ops/publish.sh deploy
  OPS_ENV_FILE=/path/to/ops/.env ops/publish.sh hotfix

行为:
  deploy 默认进入本 hotfix 通道；hotfix 是显式别名。从干净的当前提交创建精确 Git bundle，经 SSH 在生产服务器的 Node 24
  Linux 容器中隔离构建，再复用正式部署器的锁、备份、migration、健康检查、
  原子切换和回滚。不会触发 CNB。

策略:
  HOTFIX_SCOPE_POLICY=off         当前默认；分类只记录不拦截
  HOTFIX_SCOPE_POLICY=restricted  仅允许 HOTFIX_ALLOWED_RISK_CLASSES
EOF
}

case "${1:-}" in
  "") ;;
  -h|--help) usage; exit 0 ;;
  *) echo "[错误] hotfix 不接受参数: $1"; usage; exit 1 ;;
esac
case "$HOTFIX_SCOPE_POLICY" in
  off|restricted) ;;
  *) echo "[错误] HOTFIX_SCOPE_POLICY 必须是 off 或 restricted"; exit 1 ;;
esac
case "$HOTFIX_RUN_LOCAL_CHECKS" in
  0|1) ;;
  *) echo "[错误] HOTFIX_RUN_LOCAL_CHECKS 必须是 0 或 1"; exit 1 ;;
esac
for safe_value in \
  "$REMOTE_DIR" \
  "$REMOTE_WORKSPACE_CONFIG_DIR" \
  "$REMOTE_AGENT_SOURCE_DIR" \
  "$REMOTE_HOTFIX_BUILD_ROOT" \
  "$REMOTE_HOTFIX_CACHE_ROOT" \
  "$HOTFIX_NODE_IMAGE"; do
  case "$safe_value" in
    *"'"*|*$'\n'*) echo "[错误] hotfix 路径或镜像名不能包含单引号/换行"; exit 1 ;;
  esac
done

TMP_DIR="$(mktemp -d)"
TMP_KEY=""
cleanup() {
  rm -rf "$TMP_DIR"
  rm -f "${TMP_KEY:-}"
}
trap cleanup EXIT

if [ -n "${KEY:-}" ]; then
  SSH_KEY="$KEY"
elif [ -n "${KEY_CONTENT:-}" ]; then
  TMP_KEY="$(mktemp)"
  printf '%s\n' "$KEY_CONTENT" > "$TMP_KEY"
  chmod 600 "$TMP_KEY"
  SSH_KEY="$TMP_KEY"
else
  echo "[错误] hotfix 需要 KEY 或 KEY_CONTENT"
  exit 1
fi

SSH_OPTIONS=(
  -i "$SSH_KEY"
  -o BatchMode=yes
  -o ConnectTimeout=15
  -o ConnectionAttempts=1
  -o StrictHostKeyChecking=accept-new
  -o ServerAliveInterval=30
  -o ServerAliveCountMax=3
)
RSYNC_SSH_COMMAND="ssh -i $SSH_KEY -o BatchMode=yes -o ConnectTimeout=15 -o ConnectionAttempts=1 -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 -o ServerAliveCountMax=3"

cd "$SOURCE_DIR"
[ -z "$(git status --short)" ] || {
  echo "[错误] SSH hotfix 只能发布干净的已提交工作区"
  git status --short
  exit 1
}
SOURCE_SHA="$(git rev-parse HEAD)"
SOURCE_TREE="$(git rev-parse 'HEAD^{tree}')"
test "$(node -p 'process.versions.node.split(".")[0]')" = "$(tr -d '[:space:]' < .node-version)"

remote_tool_dir="$REMOTE_WORKSPACE_CONFIG_DIR/runtime/deploy-tools"
ssh "${SSH_OPTIONS[@]}" "$SERVER" "mkdir -p '$remote_tool_dir' '$REMOTE_HOTFIX_BUILD_ROOT' '$REMOTE_HOTFIX_CACHE_ROOT'"
LOCAL_DEPLOYED_RECEIPT="$TMP_DIR/deployed-release.json"
if ! rsync -az -e "$RSYNC_SSH_COMMAND" \
  "$SERVER:$REMOTE_WORKSPACE_CONFIG_DIR/deployed-release.json" \
  "$LOCAL_DEPLOYED_RECEIPT"; then
  echo "[错误] 生产部署凭证不可读，拒绝 SSH hotfix"
  exit 1
fi
remote_state="$(node ops/release-receipt.mjs inspect \
  --file "$LOCAL_DEPLOYED_RECEIPT" \
  --expected-repository "$EXPECTED_CNB_REPOSITORY" \
  --format tsv)"
IFS=$'\t' read -r \
  record_kind \
  RUNTIME_SHA \
  _runtime_tree \
  CANONICAL_SHA \
  _canonical_tree \
  _canonical_injection \
  _artifact_sha \
  _repository \
  _branch \
  _transport \
  _migration_set <<< "$remote_state"
if [ "$record_kind" != "RECORD" ]; then
  echo "[错误] 生产部署凭证无效，拒绝 SSH hotfix"
  exit 1
fi
if [ "$RUNTIME_SHA" = "$SOURCE_SHA" ]; then
  echo "[错误] 当前提交已经在生产运行，无需重复 hotfix"
  exit 1
fi
git cat-file -e "${RUNTIME_SHA}^{commit}"
if ! git merge-base --is-ancestor "$RUNTIME_SHA" "$SOURCE_SHA"; then
  echo "[错误] SSH hotfix 必须从当前运行版本 ${RUNTIME_SHA:0:12} 单调向前"
  exit 1
fi

CLASSIFICATION_FILE="$TMP_DIR/classification.json"
node scripts/ci/classify-risk.mjs \
  --base "$RUNTIME_SHA" \
  --head "$SOURCE_SHA" \
  --diff-mode three-dot > "$CLASSIFICATION_FILE"
HOTFIX_RISK_CLASS="$(node -e 'const x=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); process.stdout.write(x.riskClass)' "$CLASSIFICATION_FILE")"
echo "==> hotfix 风险分类: $HOTFIX_RISK_CLASS（scope policy: $HOTFIX_SCOPE_POLICY）"
if [ "$HOTFIX_SCOPE_POLICY" = "restricted" ]; then
  case ",$HOTFIX_ALLOWED_RISK_CLASSES," in
    *",$HOTFIX_RISK_CLASS,"*) ;;
    *) echo "[错误] restricted hotfix 不允许风险等级 $HOTFIX_RISK_CLASS"; exit 1 ;;
  esac
fi

if [ "$HOTFIX_RUN_LOCAL_CHECKS" = "1" ]; then
  echo "==> 运行 hotfix 快速本地门禁..."
  npm run check:blockers
  WORKSPACE_DIFF_BASE="$RUNTIME_SHA" WORKSPACE_DIFF_HEAD="$SOURCE_SHA" npm run db:migration:policy
  npm run typecheck:quick
else
  echo "[警告] HOTFIX_RUN_LOCAL_CHECKS=0：跳过本地快速门禁，Linux production build 仍强制执行"
fi
[ -z "$(git status --short)" ] || {
  echo "[错误] hotfix 检查后工作区发生变化"
  git status --short
  exit 1
}

BUNDLE_PATH="$TMP_DIR/workspace-hotfix.bundle"
git bundle create "$BUNDLE_PATH" HEAD "^$RUNTIME_SHA"
git bundle verify "$BUNDLE_PATH"

remote_bundle="$REMOTE_HOTFIX_BUILD_ROOT/$SOURCE_SHA.bundle"
REMOTE_BUILD_ROOT="$REMOTE_HOTFIX_BUILD_ROOT/$SOURCE_SHA"
remote_builder="$REMOTE_BUILD_ROOT/hotfix-remote-build.sh"
ssh "${SSH_OPTIONS[@]}" "$SERVER" "mkdir -p '$REMOTE_BUILD_ROOT'"
rsync -az -e "$RSYNC_SSH_COMMAND" "$BUNDLE_PATH" "$SERVER:$remote_bundle"
rsync -az -e "$RSYNC_SSH_COMMAND" ops/hotfix-remote-build.sh "$SERVER:$remote_builder"
ssh "${SSH_OPTIONS[@]}" "$SERVER" \
  "REMOTE_DIR='$REMOTE_DIR' \
REMOTE_WORKSPACE_CONFIG_DIR='$REMOTE_WORKSPACE_CONFIG_DIR' \
REMOTE_AGENT_SOURCE_DIR='$REMOTE_AGENT_SOURCE_DIR' \
REMOTE_HOTFIX_BUILD_ROOT='$REMOTE_HOTFIX_BUILD_ROOT' \
REMOTE_HOTFIX_CACHE_ROOT='$REMOTE_HOTFIX_CACHE_ROOT' \
SOURCE_SHA='$SOURCE_SHA' \
SOURCE_TREE='$SOURCE_TREE' \
BASE_SHA='$RUNTIME_SHA' \
BUNDLE_PATH='$remote_bundle' \
HOTFIX_NODE_IMAGE='$HOTFIX_NODE_IMAGE' \
HOTFIX_BUILD_CPUS='$HOTFIX_BUILD_CPUS' \
HOTFIX_BUILD_MEMORY='$HOTFIX_BUILD_MEMORY' \
bash '$remote_builder'"

build_result="$(ssh "${SSH_OPTIONS[@]}" "$SERVER" "cat '$REMOTE_BUILD_ROOT/build-result.env'")"
REMOTE_ARTIFACT_PATH="$(printf '%s\n' "$build_result" | sed -n 's/^ARTIFACT_PATH=//p')"
REMOTE_MANIFEST_PATH="$(printf '%s\n' "$build_result" | sed -n 's/^MANIFEST_PATH=//p')"
RESOLVED_BUILD_IMAGE="$(printf '%s\n' "$build_result" | sed -n 's/^BUILD_IMAGE=//p')"
case "$REMOTE_ARTIFACT_PATH:$REMOTE_MANIFEST_PATH" in
  "$REMOTE_BUILD_ROOT"/*:"$REMOTE_BUILD_ROOT"/*) ;;
  *) echo "[错误] 服务器 hotfix build result 路径无效"; exit 1 ;;
esac
LOCAL_MANIFEST="$TMP_DIR/workspace-standalone.manifest.json"
rsync -az -e "$RSYNC_SSH_COMMAND" "$SERVER:$REMOTE_MANIFEST_PATH" "$LOCAL_MANIFEST"

echo "==> 进入受治理 SSH cutover..."
export SERVER REMOTE_DIR REMOTE_WORKSPACE_CONFIG_DIR HEALTHCHECK_URL
export REMOTE_AGENT_SOURCE_ROOT REMOTE_AGENT_SOURCE_DIR
export REMOTE_HOTFIX_BUILD_ROOT
export RELEASE_SOURCE_BRANCH EXPECTED_CNB_REPOSITORY
export RELEASE_TRANSPORT=ssh-hotfix
export RELEASE_SOURCE_SHA="$SOURCE_SHA"
export RELEASE_SOURCE_TREE="$SOURCE_TREE"
export REMOTE_STANDALONE_ARTIFACT_PATH="$REMOTE_ARTIFACT_PATH"
export REMOTE_STANDALONE_MANIFEST_PATH="$REMOTE_MANIFEST_PATH"
export STANDALONE_MANIFEST_PATH="$LOCAL_MANIFEST"
export HOTFIX_SCOPE_POLICY HOTFIX_RISK_CLASS
export HOTFIX_BUILD_IMAGE="$RESOLVED_BUILD_IMAGE"
export RUN_LOCAL_CHECKS=0
export KEY="$SSH_KEY"
bash "$SCRIPT_DIR/deploy.sh"

echo "==> SSH hotfix 发布完成: ${SOURCE_SHA:0:12}（canonical baseline: ${CANONICAL_SHA:0:12}）"
