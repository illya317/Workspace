#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

expected_node_major="$(tr -d '[:space:]' < .node-version)"
actual_node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$actual_node_major" != "$expected_node_major" ]; then
  echo "[错误] CNB Builder Node 主版本不匹配：期望 $expected_node_major，实际 $actual_node_major"
  exit 1
fi

for command_name in node npm ssh rsync git tar python3 make g++ rg psql pg_ctlcluster createdb runuser; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "[错误] CNB Builder 缺少命令：$command_name"
    exit 1
  fi
done

if [ "$(uname -s)" != "Linux" ]; then
  echo "[错误] CNB Builder 必须运行在 Linux"
  exit 1
fi

echo "==> CNB Builder 已验证：Node $(node --version), npm $(npm --version), $(uname -m)"
