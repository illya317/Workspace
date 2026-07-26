#!/usr/bin/env -S -i /bin/bash
set -euo pipefail

PATH="/usr/bin:/bin:/usr/sbin:/sbin"
export PATH

SCRIPT_PATH="$0"
if [ -L "$SCRIPT_PATH" ]; then
  echo "[kimi-sandbox] runner must not be a symlink" >&2
  exit 64
fi
ROOT="$(cd "$(dirname "$SCRIPT_PATH")/.." && pwd -P)"
RUNNER_DIR="$ROOT/bin"
REAL_EXECUTABLE="$ROOT/venv/bin/kimi"
SANDBOX_EXECUTABLE="/usr/bin/sandbox-exec"
SANDBOX_PROFILE="$RUNNER_DIR/kimi-sandbox-darwin.sb"
VENV_DIR="$ROOT/venv"
CONFIG_DIR="$ROOT/config"
SKILLS_DIR="$ROOT/skills"
SHARE_DIR="$ROOT/share"
HOME_DIR="$ROOT/home"
TMP_DIR="$ROOT/tmp"
ROOT_PARENT_1="$(dirname "$ROOT")"
ROOT_PARENT_2="$(dirname "$ROOT_PARENT_1")"
ROOT_PARENT_3="$(dirname "$ROOT_PARENT_2")"
ROOT_PARENT_4="$(dirname "$ROOT_PARENT_3")"
ROOT_PARENT_5="$(dirname "$ROOT_PARENT_4")"
ROOT_PARENT_6="$(dirname "$ROOT_PARENT_5")"

canonical_path() {
  local target="$1"
  local target_dir
  target_dir="$(cd "$(dirname "$target")" 2>/dev/null && pwd -P)" || return 1
  printf '%s/%s\n' "$target_dir" "$(basename "$target")"
}

require_under_root() {
  local value="$1"
  local label="$2"
  case "$value" in
    "$ROOT"/*) ;;
    *) echo "[kimi-sandbox] $label must stay under the runtime root" >&2; exit 64 ;;
  esac
}

WORK_DIR=""
AGENT_FILE=""
previous=""
for argument in "$@"; do
  if [ "$previous" = "--work-dir" ]; then
    WORK_DIR="$argument"
  elif [ "$previous" = "--agent-file" ]; then
    AGENT_FILE="$argument"
  else
    case "$argument" in
      --work-dir=*) WORK_DIR="${argument#--work-dir=}" ;;
      --agent-file=*) AGENT_FILE="${argument#--agent-file=}" ;;
    esac
  fi
  previous="$argument"
done

if [ -z "$WORK_DIR" ]; then
  echo "[kimi-sandbox] SDK did not provide --work-dir" >&2
  exit 64
fi
RESOLVED_WORK_DIR="$(canonical_path "$WORK_DIR" 2>/dev/null || true)"
if [ "$RESOLVED_WORK_DIR" != "$WORK_DIR" ] || [ ! -d "$WORK_DIR" ]; then
  echo "[kimi-sandbox] work directory must be an existing canonical directory" >&2
  exit 64
fi
require_under_root "$WORK_DIR" "work directory"

AGENT_CONFIG_DIR="$CONFIG_DIR"
if [ -n "$AGENT_FILE" ]; then
  RESOLVED_AGENT_FILE="$(canonical_path "$AGENT_FILE" 2>/dev/null || true)"
  if [ "$RESOLVED_AGENT_FILE" != "$AGENT_FILE" ] || [ ! -f "$AGENT_FILE" ]; then
    echo "[kimi-sandbox] agent file must be an existing canonical file" >&2
    exit 64
  fi
  case "$AGENT_FILE" in
    "$ROOT"/turns/*/config/agent.yaml) ;;
    *) echo "[kimi-sandbox] agent file must be a per-turn Workspace config" >&2; exit 64 ;;
  esac
  AGENT_CONFIG_DIR="$(dirname "$AGENT_FILE")"
fi

if [ ! -x "$SANDBOX_EXECUTABLE" ] || [ ! -f "$SANDBOX_PROFILE" ]; then
  echo "[kimi-sandbox] macOS sandbox runtime is incomplete" >&2
  exit 69
fi
if [ ! -x "$REAL_EXECUTABLE" ]; then
  echo "[kimi-sandbox] pinned Kimi CLI is missing: $REAL_EXECUTABLE" >&2
  exit 69
fi

mkdir -p "$HOME_DIR" "$SHARE_DIR" "$WORK_DIR" "$TMP_DIR"
chmod 700 "$HOME_DIR" "$SHARE_DIR" "$WORK_DIR" "$TMP_DIR"
cd "$WORK_DIR"

exec "$SANDBOX_EXECUTABLE" \
  -f "$SANDBOX_PROFILE" \
  -D "ROOT_DIR=$ROOT" \
  -D "ROOT_PARENT_1=$ROOT_PARENT_1" \
  -D "ROOT_PARENT_2=$ROOT_PARENT_2" \
  -D "ROOT_PARENT_3=$ROOT_PARENT_3" \
  -D "ROOT_PARENT_4=$ROOT_PARENT_4" \
  -D "ROOT_PARENT_5=$ROOT_PARENT_5" \
  -D "ROOT_PARENT_6=$ROOT_PARENT_6" \
  -D "RUNNER_DIR=$RUNNER_DIR" \
  -D "VENV_DIR=$VENV_DIR" \
  -D "CONFIG_DIR=$CONFIG_DIR" \
  -D "SKILLS_DIR=$SKILLS_DIR" \
  -D "AGENT_CONFIG_DIR=$AGENT_CONFIG_DIR" \
  -D "HOME_DIR=$HOME_DIR" \
  -D "SHARE_DIR=$SHARE_DIR" \
  -D "WORK_DIR=$WORK_DIR" \
  -D "TMP_DIR=$TMP_DIR" \
  /usr/bin/env -i \
    HOME="$HOME_DIR" \
    KIMI_SHARE_DIR="$SHARE_DIR" \
    TMPDIR="$TMP_DIR" \
    PATH="$VENV_DIR/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
    LANG="${LANG:-C.UTF-8}" \
    LC_ALL="${LC_ALL:-C.UTF-8}" \
    "$REAL_EXECUTABLE" "$@"
