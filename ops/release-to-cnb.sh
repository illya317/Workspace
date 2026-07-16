#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPS_ENV_FILE="${OPS_ENV_FILE:-$SCRIPT_DIR/.env}"
# shellcheck source=/dev/null
source "$OPS_ENV_FILE"

: "${SOURCE_DIR:?SOURCE_DIR not set in $OPS_ENV_FILE}"
: "${CNB_REMOTE:?CNB_REMOTE not set in $OPS_ENV_FILE}"
: "${RELEASE_BRANCH:?RELEASE_BRANCH not set in $OPS_ENV_FILE}"
: "${CNB_REPO:?CNB_REPO not set in $OPS_ENV_FILE}"
CNB_REAL_CNB_YML="${CNB_REAL_CNB_YML:-$SCRIPT_DIR/cnb-release.yml}"

ALLOW_DIRTY=0
PRINT_COMMAND_ONLY=0
BOOTSTRAP_CONTEXT=""
RESULT_FILE=""
TRIGGER_RESPONSE_FILE=""
INTERNAL_RESULT_FILE=""
REQUEST_FILE=""
other_changes=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --allow-dirty) ALLOW_DIRTY=1 ;;
    --print-command) PRINT_COMMAND_ONLY=1 ;;
    --bootstrap-context)
      shift
      [ "$#" -gt 0 ] || { echo "[错误] --bootstrap-context 缺少文件路径"; exit 1; }
      BOOTSTRAP_CONTEXT="$1"
      ;;
    --result-file)
      shift
      [ "$#" -gt 0 ] || { echo "[错误] --result-file 缺少文件路径"; exit 1; }
      RESULT_FILE="$1"
      ;;
    -h|--help)
      cat <<'EOF'
用法:
  OPS_ENV_FILE=/path/to/ops/.env release-to-cnb.sh [选项]

选项:
  --bootstrap-context FILE  可选；首次接管生产的一次性 CNB bootstrap context
  --allow-dirty             允许工作区存在其他改动（自动 stash/pop）
  --print-command           更新 CNB release ref 后只打印 start-build 命令
  --result-file FILE        将 CNB build SN/日志 URL 原子写入绝对路径

脚本把当前已提交源码封装为 CNB release request。注入提交只包含 .cnb.yml 与
.cnb-deploy-request.json；CNB 自己检查、构建、打包和部署，不读取 GitHub API/Actions/Release。
EOF
      exit 0
      ;;
    *) echo "[错误] 未知参数: $1"; exit 1 ;;
  esac
  shift
done

cd "$SOURCE_DIR"

if [ -n "$RESULT_FILE" ]; then
  case "$RESULT_FILE" in
    /*) ;;
    *) echo "[错误] --result-file 必须是绝对路径"; exit 1 ;;
  esac
  rm -f "$RESULT_FILE"
fi
if [ -n "$BOOTSTRAP_CONTEXT" ]; then
  [ -f "$BOOTSTRAP_CONTEXT" ] || { echo "[错误] bootstrap context 不可读: $BOOTSTRAP_CONTEXT"; exit 1; }
  BOOTSTRAP_CONTEXT="$(cd "$(dirname "$BOOTSTRAP_CONTEXT")" && pwd)/$(basename "$BOOTSTRAP_CONTEXT")"
fi
if [ ! -f "$CNB_REAL_CNB_YML" ]; then
  echo "[错误] 真实 CNB 配置文件不存在: $CNB_REAL_CNB_YML"
  exit 1
fi
if [ ! -f "$SCRIPT_DIR/cnb-release.yml" ] || ! cmp -s "$SCRIPT_DIR/cnb-release.yml" "$CNB_REAL_CNB_YML"; then
  echo "[错误] CNB_REAL_CNB_YML 必须与 Git 已跟踪的 ops/cnb-release.yml 逐字一致" >&2
  exit 1
fi
if grep -qE '<owner>|<env-repo>' "$CNB_REAL_CNB_YML"; then
  echo "[错误] 真实 CNB 配置文件仍包含占位符: $CNB_REAL_CNB_YML"
  exit 1
fi

current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [ "$current_branch" != "$RELEASE_BRANCH" ]; then
  echo "[错误] 当前分支是 ${current_branch}，请切换到 $RELEASE_BRANCH 后再发布"
  exit 1
fi
if ! git diff --quiet -- .cnb.yml .cnb-deploy-request.json \
  || ! git diff --cached --quiet -- .cnb.yml .cnb-deploy-request.json; then
  echo "[错误] CNB 注入文件有未提交改动，请先处理"
  exit 1
fi
if [ -e .cnb-deploy-request.json ]; then
  echo "[错误] canonical source 不应包含 .cnb-deploy-request.json"
  exit 1
fi

other_changes="$(git status --short -- . ':(exclude).cnb.yml' ':(exclude).cnb-deploy-request.json' || true)"
if [ -n "$other_changes" ]; then
  if [ "$ALLOW_DIRTY" != "1" ]; then
    echo "[错误] 工作区存在其他未提交改动。请先提交或清理："
    echo "$other_changes"
    exit 1
  fi
  echo "==> 暂存其他未提交改动（--allow-dirty）..."
  git stash push -m "release-to-cnb auto stash" --include-untracked -- . \
    ':(exclude).cnb.yml' ':(exclude).cnb-deploy-request.json'
fi

cleanup() {
  local exit_code=$?
  local release_branch="${CNB_RELEASE_BRANCH:-cnb-release}"
  git checkout "$RELEASE_BRANCH" 2>/dev/null || true
  git branch -D "$release_branch" 2>/dev/null || true
  rm -f "${TRIGGER_RESPONSE_FILE:-}" "${INTERNAL_RESULT_FILE:-}" "${REQUEST_FILE:-}"
  if [ "$ALLOW_DIRTY" = "1" ] && [ -n "$other_changes" ]; then
    echo "==> 恢复暂存的改动..."
    if ! git stash pop; then
      echo "[严重] 恢复暂存改动失败，请手动检查 git stash list"
      exit 1
    fi
  fi
  return "$exit_code"
}
trap cleanup EXIT

source_sha="$(git rev-parse HEAD)"
source_tree="$(git rev-parse 'HEAD^{tree}')"
REQUEST_FILE="$(mktemp)"
request_args=(
  create
  --cwd "$SOURCE_DIR"
  --source-sha "$source_sha"
  --source-ref "$RELEASE_BRANCH"
  --repository "$CNB_REPO"
  --output "$REQUEST_FILE"
)
if [ -n "$BOOTSTRAP_CONTEXT" ]; then request_args+=(--bootstrap-context "$BOOTSTRAP_CONTEXT"); fi
node ops/cnb-deploy-request.mjs "${request_args[@]}"

cnb_release_branch="${CNB_RELEASE_BRANCH:-cnb-release}"
git branch -D "$cnb_release_branch" 2>/dev/null || true
git checkout -b "$cnb_release_branch"
cp "$CNB_REAL_CNB_YML" .cnb.yml
cp "$REQUEST_FILE" .cnb-deploy-request.json
chmod 600 .cnb-deploy-request.json
git add .cnb.yml
git add -f .cnb-deploy-request.json
injection_files="$(git diff --cached --name-only | LC_ALL=C sort)"
if [ "$injection_files" != $'.cnb-deploy-request.json\n.cnb.yml' ]; then
  echo "[错误] CNB injection commit 只能修改 .cnb.yml 与 .cnb-deploy-request.json"
  printf '%s\n' "$injection_files"
  exit 1
fi
git commit -m "chore(cnb): request native deploy for ${source_sha:0:12}" --quiet
if [ "$(git rev-parse HEAD^)" != "$source_sha" ]; then
  echo "[错误] CNB injection commit parent 不是发布源码 SHA"
  exit 1
fi

echo "==> 推送 $cnb_release_branch 到 CNB..."
git push --no-verify -f "$CNB_REMOTE" "$cnb_release_branch"
release_sha="$(git rev-parse HEAD)"

cnb_start_build_cmd=(
  cnb build start-build
  --repo "$CNB_REPO"
  --branch "$cnb_release_branch"
  --sha "$release_sha"
  --event "${CNB_DEPLOY_EVENT:-api_trigger_manual}"
  --title "native deploy ${source_sha:0:8} via ${release_sha:0:8}"
  --sync false
  --verbose
)
printf -v cnb_start_build_display "%q " "${cnb_start_build_cmd[@]}"
echo "==> CNB 触发命令:"
echo "  $cnb_start_build_display"

if [ "$PRINT_COMMAND_ONLY" = "1" ]; then
  echo "==> --print-command：已更新 CNB release ref，但未触发 build/deploy。"
  exit 0
fi
command -v cnb >/dev/null 2>&1 || { echo "[错误] 未找到 cnb CLI"; exit 1; }
TRIGGER_RESPONSE_FILE="$(mktemp)"
if ! env -u CNB_TOKEN "${cnb_start_build_cmd[@]}" > "$TRIGGER_RESPONSE_FILE"; then
  cat "$TRIGGER_RESPONSE_FILE"
  exit 1
fi
cat "$TRIGGER_RESPONSE_FILE"
if [ -z "$RESULT_FILE" ]; then
  INTERNAL_RESULT_FILE="$(mktemp)"
  RESULT_FILE="$INTERNAL_RESULT_FILE"
fi
node scripts/ci/cnb-build-state.mjs parse-trigger --input "$TRIGGER_RESPONSE_FILE" --output "$RESULT_FILE" >/dev/null
echo "==> CNB native build/deploy 已触发。"
