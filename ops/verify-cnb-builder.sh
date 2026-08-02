#!/bin/bash
set -uo pipefail

diagnostic_failures=()
record_failure() { diagnostic_failures+=("$1"); }
finish_diagnostics() {
  (( ${#diagnostic_failures[@]} == 0 )) && return 0
  printf '[错误] CNB Builder 验证失败 (%d):\n' "${#diagnostic_failures[@]}" >&2
  for failure in "${diagnostic_failures[@]}"; do
    printf ' - %s\n' "$failure" >&2
  done
  return 1
}

repository_root="$(cd "$(dirname "$0")/.." && pwd)" || {
  echo "[错误] 无法定位 CNB Builder 仓库根目录" >&2
  exit 1
}
cd "$repository_root" || exit 1

expected_node_major=""
actual_node_major=""
if ! expected_node_major="$(tr -d '[:space:]' < .node-version)"; then
  record_failure "无法读取 .node-version"
fi
if ! actual_node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null)"; then
  record_failure "无法读取 CNB Builder Node 版本"
elif [ -n "$expected_node_major" ] && [ "$actual_node_major" != "$expected_node_major" ]; then
  record_failure "Node 主版本不匹配：期望 $expected_node_major，实际 $actual_node_major"
fi

for command_name in node npm ssh rsync git tar python3 make g++ rg psql pg_ctlcluster createdb runuser; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    record_failure "缺少命令：$command_name"
  fi
done

kernel_name=""
if ! kernel_name="$(uname -s)"; then
  record_failure "无法读取操作系统类型"
elif [ "$kernel_name" != Linux ]; then
  record_failure "必须运行在 Linux，当前为 $kernel_name"
fi

finish_diagnostics || exit 1
echo "==> CNB Builder 已验证：Node $(node --version), npm $(npm --version), $(uname -m)"
