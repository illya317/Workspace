#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
NODE_VERSION_FILE="$REPOSITORY_ROOT/.node-version"

if [ "$#" -eq 0 ]; then
  echo "[错误] run-with-repo-node.sh 需要一个待执行命令" >&2
  exit 2
fi
if [ ! -f "$NODE_VERSION_FILE" ]; then
  echo "[错误] 缺少仓库 Node 版本文件: $NODE_VERSION_FILE" >&2
  exit 1
fi

REQUIRED_NODE_MAJOR="$(tr -d '[:space:]' < "$NODE_VERSION_FILE")"
if [[ ! "$REQUIRED_NODE_MAJOR" =~ ^[0-9]+$ ]]; then
  echo "[错误] .node-version 必须只包含 Node 主版本号" >&2
  exit 1
fi

RUNTIME_TMPDIR="${WORKSPACE_RUNTIME_TMPDIR:-$REPOSITORY_ROOT/.cache/runtime-tmp}"
if [[ "$RUNTIME_TMPDIR" != /* ]]; then
  echo "[错误] WORKSPACE_RUNTIME_TMPDIR 必须是绝对路径" >&2
  exit 1
fi
mkdir -p "$RUNTIME_TMPDIR"
export TMPDIR="$RUNTIME_TMPDIR"

node_major() {
  "$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null || true
}

candidates=()
if [ -n "${WORKSPACE_NODE_BINARY:-}" ]; then
  if [[ "$WORKSPACE_NODE_BINARY" != /* ]]; then
    echo "[错误] WORKSPACE_NODE_BINARY 必须是绝对路径" >&2
    exit 1
  fi
  candidates+=("$WORKSPACE_NODE_BINARY")
fi
if current_node="$(command -v node 2>/dev/null)"; then
  candidates+=("$current_node")
fi
candidates+=(
  "/usr/local/bin/node"
  "/opt/homebrew/opt/node@${REQUIRED_NODE_MAJOR}/bin/node"
  "/usr/local/opt/node@${REQUIRED_NODE_MAJOR}/bin/node"
)
if [ -n "${HOME:-}" ]; then
  for candidate in \
    "$HOME"/.nvm/versions/node/v"$REQUIRED_NODE_MAJOR"*/bin/node \
    "$HOME"/.local/share/mise/installs/node/"$REQUIRED_NODE_MAJOR"*/bin/node \
    "$HOME"/.asdf/installs/nodejs/"$REQUIRED_NODE_MAJOR"*/bin/node \
    "$HOME"/Library/Application\ Support/fnm/node-versions/v"$REQUIRED_NODE_MAJOR"*/installation/bin/node; do
    [ -x "$candidate" ] && candidates+=("$candidate")
  done
fi
if command -v brew >/dev/null 2>&1; then
  brew_node_prefix="$(brew --prefix "node@${REQUIRED_NODE_MAJOR}" 2>/dev/null || true)"
  [ -z "$brew_node_prefix" ] || candidates+=("$brew_node_prefix/bin/node")
fi

selected_node=""
for candidate in "${candidates[@]}"; do
  if [ -x "$candidate" ] && [ "$(node_major "$candidate")" = "$REQUIRED_NODE_MAJOR" ]; then
    selected_node="$candidate"
    break
  fi
done
if [ -z "$selected_node" ]; then
  echo "[错误] 未找到仓库要求的 Node ${REQUIRED_NODE_MAJOR}。请安装该主版本，或设置 WORKSPACE_NODE_BINARY=/absolute/path/to/node。" >&2
  exit 1
fi

export PATH="$(dirname "$selected_node"):$PATH"
export WORKSPACE_REPO_RUNTIME_READY=1
hash -r

if [ "$(node -p 'process.versions.node.split(".")[0]')" != "$REQUIRED_NODE_MAJOR" ]; then
  echo "[错误] Node ${REQUIRED_NODE_MAJOR} 选择失败" >&2
  exit 1
fi

exec "$@"
