#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GENERATION_TOOL="$SCRIPT_DIR/gateway-generation.mjs"
GATEWAY_ROOT="${WORKSPACE_GATEWAY_ROOT:-/srv/workspace/gateway}"
NGINX_SITE="${WORKSPACE_GATEWAY_NGINX_SITE:-}"
CHECK_ONLY=0
GENERATION_SOURCE=""

usage() {
  echo "用法: $0 --generation /absolute/generation-dir [--check-only]" >&2
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --generation)
      [ "$#" -ge 2 ] || { usage; exit 2; }
      GENERATION_SOURCE=$2
      shift 2
      ;;
    --check-only)
      CHECK_ONLY=1
      shift
      ;;
    *)
      usage
      exit 2
      ;;
  esac
done

[ -n "$GENERATION_SOURCE" ] || { usage; exit 2; }
[ "${GENERATION_SOURCE#/}" != "$GENERATION_SOURCE" ] || { echo "[错误] generation 路径必须是绝对路径" >&2; exit 1; }
[ "${GATEWAY_ROOT#/}" != "$GATEWAY_ROOT" ] || { echo "[错误] WORKSPACE_GATEWAY_ROOT 必须是绝对路径" >&2; exit 1; }

GENERATION_SOURCE="$(readlink -f "$GENERATION_SOURCE")"
GENERATION_ID="$(node "$GENERATION_TOOL" assert --generation "$GENERATION_SOURCE")"
INCLUDE_PATH="$GATEWAY_ROOT/current/workspace-gateway.conf"

resolve_nginx_site() {
  if [ -n "$NGINX_SITE" ]; then
    readlink -f "$NGINX_SITE"
    return
  fi
  local candidates=()
  local candidate resolved
  while IFS= read -r candidate; do
    resolved="$(readlink -f "$candidate")"
    if [[ " ${candidates[*]-} " != *" $resolved "* ]]; then
      candidates+=("$resolved")
    fi
  done < <(sudo grep -lE '# BEGIN workspace-deploy-gateway|location[[:space:]]+(\^~[[:space:]]+)?/workspace([[:space:]]|\{)' /etc/nginx/sites-enabled/* 2>/dev/null || true)
  if [ "${#candidates[@]}" -ne 1 ]; then
    echo "[错误] 无法唯一识别 Workspace Nginx 站点；请设置 WORKSPACE_GATEWAY_NGINX_SITE" >&2
    exit 1
  fi
  printf '%s\n' "${candidates[0]}"
}

prepare_nginx_site() {
  local source_site=$1
  local target_site=$2
  SITE_PATH="$source_site" TARGET_PATH="$target_site" INCLUDE_PATH="$INCLUDE_PATH" python3 - <<'PY'
import os
from pathlib import Path
import re

source = Path(os.environ["SITE_PATH"])
target = Path(os.environ["TARGET_PATH"])
include_path = os.environ["INCLUDE_PATH"]
text = source.read_text(encoding="utf-8")
begin = "# BEGIN workspace-deploy-gateway"
end = "# END workspace-deploy-gateway"
begin_count = text.count(begin)
end_count = text.count(end)
if begin_count or end_count:
    if begin_count != 1 or end_count != 1:
        raise SystemExit("Workspace Gateway Nginx markers are incomplete or duplicated")
    expected = f"include {include_path};"
    marker_body = text[text.index(begin):text.index(end) + len(end)]
    if expected not in marker_body:
        raise SystemExit("Workspace Gateway Nginx include path drifted")
    target.write_text(text, encoding="utf-8")
    raise SystemExit(0)

matches = list(re.finditer(r"(?m)^(?P<indent>[ \t]*)location[ \t]+(?:\^~[ \t]+)?/workspace(?=[ \t]*\{)", text))
if len(matches) != 1:
    raise SystemExit(f"expected exactly one legacy /workspace location, received {len(matches)}")
match = matches[0]
opening = text.find("{", match.end())
depth = 0
closing = None
for index in range(opening, len(text)):
    char = text[index]
    if char == "{":
        depth += 1
    elif char == "}":
        depth -= 1
        if depth == 0:
            closing = index + 1
            break
if closing is None:
    raise SystemExit("legacy /workspace location has unbalanced braces")
indent = match.group("indent")
replacement = (
    f"{indent}{begin}\n"
    f"{indent}include {include_path};\n"
    f"{indent}{end}"
)
target.write_text(text[:match.start()] + replacement + text[closing:], encoding="utf-8")
PY
}

atomic_replace() {
  python3 - "$1" "$2" <<'PY'
import os
import sys

os.replace(sys.argv[1], sys.argv[2])
PY
}

NGINX_SITE="$(resolve_nginx_site)"
[ -f "$NGINX_SITE" ] || { echo "[错误] Nginx site 不存在: $NGINX_SITE" >&2; exit 1; }
PROPOSED_SITE="$(mktemp)"
cleanup_proposed() {
  rm -f "$PROPOSED_SITE"
}
trap cleanup_proposed EXIT
prepare_nginx_site "$NGINX_SITE" "$PROPOSED_SITE"

if [ "$CHECK_ONLY" = "1" ]; then
  echo "Gateway generation $GENERATION_ID 与 Nginx site contract 通过"
  exit 0
fi

mkdir -p "$GATEWAY_ROOT/generations"
chmod 700 "$GATEWAY_ROOT" "$GATEWAY_ROOT/generations"
TARGET_GENERATION="$GATEWAY_ROOT/generations/$GENERATION_ID"
if [ ! -d "$TARGET_GENERATION" ]; then
  STAGED_GENERATION="$GATEWAY_ROOT/generations/.staged-$GENERATION_ID-$$"
  rm -rf "$STAGED_GENERATION"
  cp -a "$GENERATION_SOURCE" "$STAGED_GENERATION"
  mv "$STAGED_GENERATION" "$TARGET_GENERATION"
  if ! node "$GENERATION_TOOL" assert --generation "$TARGET_GENERATION" >/dev/null; then
    rm -rf "$TARGET_GENERATION"
    exit 1
  fi
fi
node "$GENERATION_TOOL" assert --generation "$TARGET_GENERATION" >/dev/null

CURRENT_LINK="$GATEWAY_ROOT/current"
OLD_TARGET="$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)"
SITE_BACKUP="$(mktemp)"
CURRENT_SWAP="$GATEWAY_ROOT/.current.swap-$GENERATION_ID-$$"
COMMITTED=0
SITE_INSTALLED=0

rollback_gateway() {
  local exit_code=$?
  rm -f "$CURRENT_SWAP"
  if [ "$COMMITTED" = "0" ]; then
    if [ -n "$OLD_TARGET" ]; then
      ln -s "$OLD_TARGET" "$CURRENT_SWAP"
      atomic_replace "$CURRENT_SWAP" "$CURRENT_LINK"
    else
      rm -f "$CURRENT_LINK"
    fi
    if [ "$SITE_INSTALLED" = "1" ]; then
      sudo install -m 0644 "$SITE_BACKUP" "$NGINX_SITE"
    fi
    sudo nginx -t >/dev/null 2>&1 || true
    sudo systemctl reload nginx >/dev/null 2>&1 || true
  fi
  rm -f "$SITE_BACKUP"
  exit "$exit_code"
}
trap rollback_gateway EXIT

sudo cp "$NGINX_SITE" "$SITE_BACKUP"
ln -s "$TARGET_GENERATION" "$CURRENT_SWAP"
atomic_replace "$CURRENT_SWAP" "$CURRENT_LINK"
if ! cmp -s "$NGINX_SITE" "$PROPOSED_SITE"; then
  sudo install -m 0644 "$PROPOSED_SITE" "$NGINX_SITE"
  SITE_INSTALLED=1
fi
sudo nginx -t
sudo systemctl reload nginx
COMMITTED=1
rm -f "$SITE_BACKUP"
trap cleanup_proposed EXIT

echo "Workspace Gateway 已切换到 generation $GENERATION_ID"
