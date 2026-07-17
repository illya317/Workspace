#!/usr/bin/env -S -i /bin/bash
# shellcheck shell=bash
set -euo pipefail

PATH="/usr/bin:/bin"
export PATH
SCRIPT_PATH="$(readlink -f "$0")"
ROOT="$(cd "$(dirname "$SCRIPT_PATH")/.." && pwd -P)"
REAL_EXECUTABLE="$ROOT/venv/bin/kimi"
SHARE_DIR="$ROOT/share"
HOME_DIR="$ROOT/home"
BWRAP_EXECUTABLE="/usr/local/lib/workspace-kimi-agent/bwrap"

require_under_root() {
  local value="$1"
  local label="$2"
  case "$value" in
    "$ROOT"/*) ;;
    *) echo "[kimi-sandbox] $label must stay under the runtime root" >&2; exit 64 ;;
  esac
}

require_under_root "$REAL_EXECUTABLE" "real executable"
require_under_root "$SHARE_DIR" "share directory"
require_under_root "$HOME_DIR" "home directory"

WORK_DIR=""
previous=""
for argument in "$@"; do
  if [ "$previous" = "--work-dir" ]; then
    WORK_DIR="$argument"
    break
  fi
  case "$argument" in
    --work-dir=*) WORK_DIR="${argument#--work-dir=}"; break ;;
  esac
  previous="$argument"
done

if [ -z "$WORK_DIR" ]; then
  echo "[kimi-sandbox] SDK did not provide --work-dir" >&2
  exit 64
fi
require_under_root "$WORK_DIR" "work directory"

if [ ! -x "$BWRAP_EXECUTABLE" ]; then
  echo "[kimi-sandbox] dedicated bubblewrap is required: $BWRAP_EXECUTABLE" >&2
  exit 69
fi
if [ ! -x "$REAL_EXECUTABLE" ]; then
  echo "[kimi-sandbox] pinned Kimi CLI is missing: $REAL_EXECUTABLE" >&2
  exit 69
fi

args=(
  --die-with-parent
  --new-session
  --unshare-all
  --share-net
  --proc /proc
  --dev /dev
  --tmpfs /tmp
  --dir /etc
  --ro-bind /usr /usr
  --ro-bind "$ROOT/venv" "$ROOT/venv"
  --ro-bind "$ROOT/config" "$ROOT/config"
  --ro-bind "$ROOT/skills" "$ROOT/skills"
  --bind "$HOME_DIR" "$HOME_DIR"
  --bind "$SHARE_DIR" "$SHARE_DIR"
  --bind "$WORK_DIR" "$WORK_DIR"
  --chdir "$WORK_DIR"
  --clearenv
  --setenv HOME "$HOME_DIR"
  --setenv KIMI_SHARE_DIR "$SHARE_DIR"
  --setenv PATH "$ROOT/venv/bin:/usr/local/bin:/usr/bin:/bin"
  --setenv LANG "${LANG:-C.UTF-8}"
  --setenv LC_ALL "${LC_ALL:-C.UTF-8}"
)

for system_dir in /bin /lib /lib64; do
  if [ -e "$system_dir" ]; then
    args+=(--ro-bind "$system_dir" "$system_dir")
  fi
done
for system_file in /etc/hosts /etc/resolv.conf /etc/nsswitch.conf /etc/localtime /etc/ssl /etc/ca-certificates; do
  if [ -e "$system_file" ]; then
    args+=(--ro-bind "$system_file" "$system_file")
  fi
done

exec "$BWRAP_EXECUTABLE" "${args[@]}" "$REAL_EXECUTABLE" "$@"
