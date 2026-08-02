#!/usr/bin/env bash
set -euo pipefail
umask 022

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOL_ROOT="/usr/local/lib/workspace-postgresql"

if [ "${1:-}" != "--execute" ] || [ "$#" -ne 1 ]; then
  echo "用法: $0 --execute" >&2
  exit 2
fi
[ "$(id -u)" -eq 0 ] || { echo "[错误] production tooling 安装必须由 root 执行" >&2; exit 77; }
[ ! -L "$TOOL_ROOT" ] || { echo "[错误] 受控 tooling 目录不能是符号链接" >&2; exit 1; }

install -d -o root -g root -m 0755 "$TOOL_ROOT"

installed=0
for source in "$SOURCE_DIR"/production-*; do
  [ -f "$source" ] || continue
  case "$(basename "$source")" in
    *.test.mjs) continue ;;
    *.sh|*.mjs) mode=0755 ;;
    *.sql|*.service|*.conf|*.py) mode=0644 ;;
    *) echo "[错误] 未知 production tooling 类型: $source" >&2; exit 1 ;;
  esac
  destination="$TOOL_ROOT/$(basename "$source")"
  temporary="$TOOL_ROOT/.$(basename "$source").install.$$"
  install -o root -g root -m "$mode" "$source" "$temporary"
  mv -Tf -- "$temporary" "$destination"
  installed=$((installed + 1))
done

[ "$installed" -gt 0 ] || { echo "[错误] 未发现 production tooling" >&2; exit 1; }

for tool in "$TOOL_ROOT"/production-*; do
  [ -f "$tool" ] || { echo "[错误] 受控 tooling 缺失" >&2; exit 1; }
  [ ! -L "$tool" ] || { echo "[错误] 受控 tooling 不能是符号链接: $tool" >&2; exit 1; }
  [ "$(stat -c '%u:%g' "$tool")" = "0:0" ] || { echo "[错误] 受控 tooling 必须 root:root: $tool" >&2; exit 1; }
  mode="$(stat -c %a "$tool")"
  (( (8#$mode & 8#022) == 0 )) || { echo "[错误] 受控 tooling 不能被 group/other 写入: $tool" >&2; exit 1; }
done

for sql in "$TOOL_ROOT"/production-*.sql; do
  [ -f "$sql" ] || continue
  runuser -u postgres -- test -r "$sql" || { echo "[错误] postgres 无法读取 SQL: $sql" >&2; exit 1; }
done

echo "installed production tooling: $TOOL_ROOT"
