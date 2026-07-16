#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPS_ENV_FILE="${OPS_ENV_FILE:-$SCRIPT_DIR/.env}"
# shellcheck source=/dev/null
source "$OPS_ENV_FILE"

: "${SOURCE_DIR:?SOURCE_DIR not set in $OPS_ENV_FILE}"
: "${CNB_REMOTE:?CNB_REMOTE not set in $OPS_ENV_FILE}"
: "${RELEASE_BRANCH:?RELEASE_BRANCH not set in $OPS_ENV_FILE}"
CNB_REAL_CNB_YML="${CNB_REAL_CNB_YML:-$SCRIPT_DIR/cnb-release.yml}"

ALLOW_DIRTY=0
PRINT_COMMAND_ONLY=0
EVIDENCE_FILE=""
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
    --evidence)
      shift
      if [ "$#" -eq 0 ]; then
        echo "[错误] --evidence 缺少文件路径"
        exit 1
      fi
      EVIDENCE_FILE="$1"
      ;;
    -h|--help)
      cat <<'EOF'
用法:
  OPS_ENV_FILE=/path/to/ops/.env release-to-cnb.sh [选项]

选项:
  --evidence FILE  必填；受保护 main 的 GitHub CI/产物验证证据
  --allow-dirty  允许工作区存在其他未提交改动（会自动 stash/pop）
  --print-command  更新 CNB release ref 后只打印 start-build 命令，不触发 build
  --result-file FILE  将已接受的 CNB build SN/日志 URL 原子写入 FILE

脚本只接受已经验证的 canonical source evidence，并创建一个仅包含真实 .cnb.yml
与 .cnb-release-evidence.json 的注入提交。默认要求工作区干净，避免误动用户未提交的工作。
EOF
      exit 0
      ;;
    *) echo "[错误] 未知参数: $1"; exit 1 ;;
  esac
  shift
done

cd "$SOURCE_DIR"

if [ -z "$EVIDENCE_FILE" ] || [ ! -f "$EVIDENCE_FILE" ]; then
  echo "[错误] 必须通过 --evidence 指定可读的 GitHub release evidence 文件"
  exit 1
fi
if [ -n "$RESULT_FILE" ]; then
  case "$RESULT_FILE" in
    /*) ;;
    *) echo "[错误] --result-file 必须是绝对路径"; exit 1 ;;
  esac
  rm -f "$RESULT_FILE"
fi
EVIDENCE_FILE="$(cd "$(dirname "$EVIDENCE_FILE")" && pwd)/$(basename "$EVIDENCE_FILE")"

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

current_branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$current_branch" != "$RELEASE_BRANCH" ]; then
  echo "[错误] 当前分支是 ${current_branch}，请切换到 $RELEASE_BRANCH 后再发布"
  exit 1
fi

if ! git diff --quiet -- .cnb.yml .cnb-release-evidence.json \
  || ! git diff --cached --quiet -- .cnb.yml .cnb-release-evidence.json; then
  echo "[错误] CNB 注入文件有未提交改动，请先处理"
  exit 1
fi
if [ -e .cnb-release-evidence.json ]; then
  echo "[错误] canonical source 不应包含 .cnb-release-evidence.json；请先移除残留注入文件"
  exit 1
fi

other_changes="$(git status --short -- . ':(exclude).cnb.yml' ':(exclude).cnb-release-evidence.json' || true)"
if [ -n "$other_changes" ]; then
  if [ "$ALLOW_DIRTY" != "1" ]; then
    echo "[错误] 工作区存在其他未提交改动。请先提交或清理，或使用 --allow-dirty 自动暂存："
    echo "$other_changes"
    exit 1
  fi
  echo "==> 暂存其他未提交改动（--allow-dirty）..."
  git stash push -m "release-to-cnb auto stash" --include-untracked -- . \
    ':(exclude).cnb.yml' ':(exclude).cnb-release-evidence.json'
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

github_remote="${GITHUB_REMOTE:-origin}"
echo "==> 验证 $RELEASE_BRANCH canonical source..."
git fetch "$github_remote" "$RELEASE_BRANCH"
canonical_sha="$(git rev-parse HEAD)"
canonical_tree="$(git rev-parse 'HEAD^{tree}')"
remote_sha="$(git rev-parse "$github_remote/$RELEASE_BRANCH")"
if [ "$canonical_sha" != "$remote_sha" ]; then
  echo "[错误] 本地 HEAD 不是 GitHub $RELEASE_BRANCH 当前提交；禁止发布旧版本或未合并版本"
  exit 1
fi
node ops/release-evidence.mjs validate-file \
  --file "$EVIDENCE_FILE" \
  --sha "$canonical_sha" \
  --tree "$canonical_tree" >/dev/null
bootstrap_values="$(node - "$EVIDENCE_FILE" <<'NODE'
const evidence = require(process.argv[2]);
if (evidence.deploymentBootstrap) {
  process.stdout.write(`${evidence.deploymentBootstrap.baselineSha}\n${evidence.deploymentBootstrap.legacy.cnbCommitSha}\n`);
}
NODE
)"
if [ -n "$bootstrap_values" ]; then
  if [ "$PRINT_COMMAND_ONLY" = "1" ]; then
    echo "[错误] production bootstrap evidence 禁止 --print-command"
    exit 1
  fi
  bootstrap_baseline="$(printf '%s\n' "$bootstrap_values" | sed -n '1p')"
  bootstrap_legacy_commit="$(printf '%s\n' "$bootstrap_values" | sed -n '2p')"
  bootstrap_legacy_ref="refs/tags/workspace-production-bootstrap-${bootstrap_baseline:0:12}"
  bootstrap_anchor="$(git ls-remote "$CNB_REMOTE" "$bootstrap_legacy_ref" | awk '{print $1}')"
  if [ "$bootstrap_anchor" != "$bootstrap_legacy_commit" ]; then
    echo "[错误] production bootstrap legacy CNB anchor 缺失或与 evidence 不一致"
    exit 1
  fi
fi

cnb_release_branch="${CNB_RELEASE_BRANCH:-cnb-release}"

echo "==> 创建/重置 $cnb_release_branch 分支..."
git branch -D "$cnb_release_branch" 2>/dev/null || true
git checkout -b "$cnb_release_branch"

echo "==> 注入真实 CNB CD 配置..."
cp "$CNB_REAL_CNB_YML" .cnb.yml
cp "$EVIDENCE_FILE" .cnb-release-evidence.json
chmod 600 .cnb-release-evidence.json
git add .cnb.yml
git add -f .cnb-release-evidence.json
injection_files="$(git diff --cached --name-only | LC_ALL=C sort)"
if [ "$injection_files" != $'.cnb-release-evidence.json\n.cnb.yml' ]; then
  echo "[错误] CNB injection commit 只能修改 .cnb.yml 与 .cnb-release-evidence.json"
  printf '%s\n' "$injection_files"
  exit 1
fi
git commit -m "chore(cnb): inject verified CD evidence for ${canonical_sha:0:12}" --quiet
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
  --title "deploy ${canonical_sha:0:8} via ${release_sha:0:8}"
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
