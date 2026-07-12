#!/usr/bin/env bash
set -euo pipefail

KIMI_CLI_VERSION="1.48.0"
MODE="install"
RUNTIME_ROOT="${KIMI_AGENT_RUNTIME_DIR:-${WORKSPACE_CONFIG_DIR:-$HOME/.workspace}/runtime/kimi-agent}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNNER_SOURCE="$SCRIPT_DIR/kimi-agent-sandbox-runner.sh"

usage() {
  cat <<'EOF'
Usage: ops/install-kimi-agent-runtime.sh [--check|--login] [--root DIR]

  --check     Verify bubblewrap, the pinned CLI and sandbox runner.
  --login     Start the official Kimi Coding Plan device login for this service account.
  --root DIR  Override the runtime root (default: WORKSPACE_CONFIG_DIR/runtime/kimi-agent).

The application never receives the login token. Credentials stay under ROOT/share and
are mounted only into the sandboxed Kimi CLI process.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --check) MODE="check" ;;
    --login) MODE="login" ;;
    --root)
      shift
      [ "$#" -gt 0 ] || { echo "[error] --root requires a directory"; exit 64; }
      RUNTIME_ROOT="$1"
      ;;
    -h|--help) usage; exit 0 ;;
    *) echo "[error] unknown option: $1"; usage; exit 64 ;;
  esac
  shift
done

case "$RUNTIME_ROOT" in
  /*) ;;
  *) echo "[error] runtime root must be absolute: $RUNTIME_ROOT"; exit 64 ;;
esac

VENV_DIR="$RUNTIME_ROOT/venv"
RUNNER_TARGET="$RUNTIME_ROOT/bin/kimi-sandbox"

sudo_cmd() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif sudo -n true >/dev/null 2>&1; then
    sudo -n "$@"
  else
    echo "[error] passwordless sudo is required to install bubblewrap"
    exit 1
  fi
}

python_is_supported() {
  "$1" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 12) else 1)'
}

resolve_python() {
  local candidate
  for candidate in python3.14 python3.13 python3.12 python3; do
    if command -v "$candidate" >/dev/null 2>&1 && python_is_supported "$(command -v "$candidate")"; then
      command -v "$candidate"
      return
    fi
  done
  return 1
}

check_runtime() {
  local missing=0
  if command -v bwrap >/dev/null 2>&1; then
    echo "bubblewrap=$(command -v bwrap)"
  else
    echo "[error] bubblewrap is missing"
    missing=1
  fi
  if [ -x "$RUNNER_TARGET" ]; then
    echo "sandbox_runner=$RUNNER_TARGET"
  else
    echo "[error] sandbox runner is missing: $RUNNER_TARGET"
    missing=1
  fi
  if [ -x "$VENV_DIR/bin/kimi" ]; then
    local version
    version="$($VENV_DIR/bin/kimi --version 2>&1)"
    echo "$version"
    case "$version" in
      *"$KIMI_CLI_VERSION"*) ;;
      *) echo "[error] expected Kimi CLI $KIMI_CLI_VERSION"; missing=1 ;;
    esac
  else
    echo "[error] pinned Kimi CLI is missing: $VENV_DIR/bin/kimi"
    missing=1
  fi
  if [ "$missing" -eq 0 ]; then
    local sandbox_version
    if sandbox_version="$($RUNNER_TARGET --version --work-dir "$RUNTIME_ROOT/work" 2>&1)"; then
      echo "sandbox_$sandbox_version"
      case "$sandbox_version" in
        *"$KIMI_CLI_VERSION"*) ;;
        *) echo "[error] sandbox did not execute the pinned Kimi CLI"; missing=1 ;;
      esac
    else
      echo "[error] Bubblewrap sandbox smoke failed: $sandbox_version"
      missing=1
    fi
  fi
  if [ -x "$VENV_DIR/bin/python" ] && "$VENV_DIR/bin/python" - "$RUNTIME_ROOT/share/config.toml" <<'PY'
from pathlib import Path
import sys
import tomlkit

path = Path(sys.argv[1])
if not path.is_file():
    raise SystemExit(1)
data = tomlkit.parse(path.read_text())
provider = data.get("providers", {}).get("managed:kimi-code", {})
raise SystemExit(0 if provider.get("api_key") or provider.get("oauth") else 1)
PY
  then
    echo "coding_plan_auth=configured"
  else
    echo "[warning] Coding Plan login is not configured; run with --login before enabling Agent traffic"
  fi
  [ "$missing" -eq 0 ]
}

if [ "$MODE" = "check" ]; then
  check_runtime
  exit
fi

if [ "$MODE" = "login" ]; then
  check_runtime
  mkdir -p "$RUNTIME_ROOT/home" "$RUNTIME_ROOT/share"
  chmod 700 "$RUNTIME_ROOT/home" "$RUNTIME_ROOT/share"
  exec env -i \
    HOME="$RUNTIME_ROOT/home" \
    KIMI_SHARE_DIR="$RUNTIME_ROOT/share" \
    PATH="$VENV_DIR/bin:/usr/local/bin:/usr/bin:/bin" \
    LANG="${LANG:-C.UTF-8}" \
    LC_ALL="${LC_ALL:-C.UTF-8}" \
    "$VENV_DIR/bin/kimi" login
fi

if [ "$(uname -s)" != "Linux" ]; then
  echo "[error] the production Kimi sandbox installer currently supports Linux only"
  exit 1
fi
if ! command -v apt-get >/dev/null 2>&1 || ! command -v dpkg >/dev/null 2>&1; then
  echo "[error] the production Kimi sandbox installer currently supports Ubuntu/Debian only"
  exit 1
fi
packages=(bubblewrap python3 python3-venv python3-pip)
missing_packages=()
for package in "${packages[@]}"; do
  if ! dpkg -s "$package" >/dev/null 2>&1; then
    missing_packages+=("$package")
  fi
done
if [ "${#missing_packages[@]}" -gt 0 ]; then
  sudo_cmd apt-get update
  sudo_cmd env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "${missing_packages[@]}"
fi

PYTHON_BIN="$(resolve_python || true)"
if [ -z "$PYTHON_BIN" ]; then
  echo "[error] Kimi CLI $KIMI_CLI_VERSION requires Python 3.12 or newer"
  exit 1
fi

mkdir -p "$RUNTIME_ROOT/bin" "$RUNTIME_ROOT/home" "$RUNTIME_ROOT/share" "$RUNTIME_ROOT/work" "$RUNTIME_ROOT/config" "$RUNTIME_ROOT/skills"
chmod 700 "$RUNTIME_ROOT" "$RUNTIME_ROOT/home" "$RUNTIME_ROOT/share" "$RUNTIME_ROOT/work" "$RUNTIME_ROOT/config" "$RUNTIME_ROOT/skills"
install -m 0755 "$RUNNER_SOURCE" "$RUNNER_TARGET"

if [ ! -x "$VENV_DIR/bin/python" ]; then
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi
PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_NO_INPUT=1 "$VENV_DIR/bin/python" -m pip install --upgrade pip setuptools wheel
PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_NO_INPUT=1 "$VENV_DIR/bin/python" -m pip install "kimi-cli==$KIMI_CLI_VERSION"

check_runtime
echo "Kimi Agent runtime installed. Run this script with --login once to authorize the company Coding Plan account."
