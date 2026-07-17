#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REQUIREMENTS_FILE="$SCRIPT_DIR/library-worker-requirements.txt"
SMOKE_SCRIPT="$SCRIPT_DIR/library-runtime-smoke.py"
MODE="install"
TARGET="auto"
RUN_SMOKE=0
VENV_DIR="${LIBRARY_WORKER_VENV_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/workspace-library/venv}"

usage() {
  cat <<'EOF'
Usage:
  ops/install-library-runtime-deps.sh [options]

Options:
  --check       Check system commands, OCR languages and Python packages only.
  --smoke       Run a real image-only PDF -> OCR -> searchable PDF smoke test.
  --local       Require macOS/Homebrew installation behavior.
  --server      Require Ubuntu/Debian installation behavior.
  --venv DIR    Override the isolated Python virtual environment directory.
  -h, --help    Show this help.

Environment:
  LIBRARY_WORKER_VENV_DIR  Default venv override.
  PIP_INDEX_URL            Optional private/default Python package index.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --check) MODE="check" ;;
    --smoke) RUN_SMOKE=1 ;;
    --local) TARGET="local" ;;
    --server) TARGET="server" ;;
    --venv)
      shift
      if [ "$#" -eq 0 ]; then
        echo "[error] --venv requires a directory"
        exit 1
      fi
      VENV_DIR="$1"
      ;;
    -h|--help) usage; exit 0 ;;
    *) echo "[error] unknown option: $1"; usage; exit 1 ;;
  esac
  shift
done

if [ ! -f "$REQUIREMENTS_FILE" ] || [ ! -f "$SMOKE_SCRIPT" ]; then
  echo "[error] library runtime dependency files are incomplete under $SCRIPT_DIR"
  exit 1
fi

OS_NAME="$(uname -s)"
case "$TARGET:$OS_NAME" in
  auto:Darwin|local:Darwin) TARGET="local" ;;
  auto:Linux|server:Linux) TARGET="server" ;;
  local:*) echo "[error] --local requires macOS"; exit 1 ;;
  server:*) echo "[error] --server requires Linux"; exit 1 ;;
  *) echo "[error] unsupported platform: $OS_NAME"; exit 1 ;;
esac

hash_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    sha256sum "$1" | awk '{print $1}'
  fi
}

sudo_cmd() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif sudo -n true >/dev/null 2>&1; then
    sudo -n "$@"
  else
    echo "[error] passwordless sudo is required to install server packages"
    exit 1
  fi
}

install_macos_packages() {
  if ! command -v brew >/dev/null 2>&1; then
    echo "[error] Homebrew is required for local OCR/PDF dependencies"
    exit 1
  fi
  local formulae=(python@3.12 ccache tesseract tesseract-lang ocrmypdf qpdf ghostscript poppler)
  local missing=()
  local formula
  for formula in "${formulae[@]}"; do
    if ! brew list --formula "$formula" >/dev/null 2>&1; then
      missing+=("$formula")
    fi
  done
  if [ "${#missing[@]}" -gt 0 ]; then
    echo "==> Installing Homebrew OCR/PDF formulae: ${missing[*]}"
    HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_INSTALL_CLEANUP=1 NONINTERACTIVE=1 brew install "${missing[@]}"
  fi
}

install_linux_packages() {
  if ! command -v apt-get >/dev/null 2>&1 || ! command -v dpkg >/dev/null 2>&1; then
    echo "[error] the server installer currently supports Ubuntu/Debian only"
    exit 1
  fi
  local packages=(
    python3 python3-venv python3-pip ccache
    tesseract-ocr tesseract-ocr-eng tesseract-ocr-chi-sim tesseract-ocr-chi-tra
    ocrmypdf qpdf ghostscript poppler-utils unpaper
    fonts-noto-cjk fonts-noto-core
    libgl1 libgomp1 libsm6 libxext6 libxrender1
  )
  local missing=()
  local package
  for package in "${packages[@]}"; do
    if ! dpkg -s "$package" >/dev/null 2>&1; then
      missing+=("$package")
    fi
  done
  if [ "${#missing[@]}" -gt 0 ]; then
    echo "==> Installing server OCR/PDF packages: ${missing[*]}"
    sudo_cmd apt-get update
    sudo_cmd env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "${missing[@]}"
  fi
}

resolve_python() {
  if [ "$TARGET" = "local" ]; then
    local brew_python
    brew_python="$(brew --prefix python@3.12)/bin/python3.12"
    if [ -x "$brew_python" ]; then
      printf '%s\n' "$brew_python"
      return
    fi
  fi
  if command -v python3.12 >/dev/null 2>&1; then
    command -v python3.12
  else
    command -v python3
  fi
}

install_python_packages() {
  local python_bin="$1"
  mkdir -p "$(dirname "$VENV_DIR")"
  if [ ! -x "$VENV_DIR/bin/python" ]; then
    echo "==> Creating library worker venv: $VENV_DIR"
    "$python_bin" -m venv "$VENV_DIR"
  fi

  local expected_hash
  local marker="$VENV_DIR/.workspace-library-requirements.sha256"
  expected_hash="$(hash_file "$REQUIREMENTS_FILE")"
  if [ ! -f "$marker" ] || [ "$(tr -d '\r\n' < "$marker")" != "$expected_hash" ]; then
    echo "==> Installing pinned Python document-processing packages"
    PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_NO_INPUT=1 "$VENV_DIR/bin/python" -m pip install --upgrade pip setuptools wheel
    if [ "$TARGET" = "server" ]; then
      echo "==> Installing CPU-only PyTorch runtime"
      PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_NO_INPUT=1 "$VENV_DIR/bin/python" -m pip install \
        --no-deps \
        --index-url https://download.pytorch.org/whl/cpu \
        torch==2.7.1+cpu torchvision==0.22.1+cpu
    fi
    PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_NO_INPUT=1 "$VENV_DIR/bin/python" -m pip install -r "$REQUIREMENTS_FILE"
    printf '%s\n' "$expected_hash" > "$marker"
  fi
}

check_runtime() {
  local missing=0
  local command_name
  for command_name in ccache tesseract ocrmypdf qpdf gs pdftotext pdfinfo; do
    if command -v "$command_name" >/dev/null 2>&1; then
      echo "$command_name=$(command -v "$command_name")"
    else
      echo "[error] missing command: $command_name"
      missing=1
    fi
  done

  if command -v tesseract >/dev/null 2>&1; then
    local languages
    languages="$(tesseract --list-langs 2>/dev/null || true)"
    local language
    for language in eng chi_sim chi_tra; do
      if ! printf '%s\n' "$languages" | grep -qx "$language"; then
        echo "[error] missing Tesseract language: $language"
        missing=1
      fi
    done
  fi

  if [ ! -x "$VENV_DIR/bin/python" ]; then
    echo "[error] missing library worker venv: $VENV_DIR"
    missing=1
  else
    LIBRARY_REQUIREMENTS_FILE="$REQUIREMENTS_FILE" PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True "$VENV_DIR/bin/python" - <<'PY' || missing=1
import importlib
import importlib.metadata
import os
from pathlib import Path
import sys

if sys.version_info[:2] != (3, 12):
    raise RuntimeError(f"library worker requires Python 3.12, got {sys.version.split()[0]}")
print(f"python={sys.version.split()[0]}")

modules = {
    "docling": "docling",
    "paddleocr": "paddleocr",
    "paddle": "paddlepaddle",
    "pdfplumber": "pdfplumber",
    "pypdf": "pypdf",
    "pymupdf": "pymupdf",
    "torch": "torch",
    "torchvision": "torchvision",
}
for module, distribution in modules.items():
    importlib.import_module(module)
    print(f"{distribution}={importlib.metadata.version(distribution)}")

for raw_line in Path(os.environ["LIBRARY_REQUIREMENTS_FILE"]).read_text().splitlines():
    line = raw_line.strip()
    if not line or line.startswith("#"):
        continue
    distribution, expected = line.split("==", 1)
    actual = importlib.metadata.version(distribution)
    if actual != expected:
        raise RuntimeError(f"{distribution} expected {expected}, got {actual}")
PY
    "$VENV_DIR/bin/python" -m pip check || missing=1
  fi

  if [ "$missing" -ne 0 ]; then
    return 1
  fi
  echo "Library OCR/PDF runtime dependency check passed."
}

if [ "$MODE" = "install" ]; then
  if [ "$TARGET" = "local" ]; then
    install_macos_packages
  else
    install_linux_packages
  fi
  PYTHON_BIN="$(resolve_python)"
  install_python_packages "$PYTHON_BIN"
fi

check_runtime

if [ "$RUN_SMOKE" = "1" ]; then
  echo "==> Running library OCR/PDF smoke test"
  PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True "$VENV_DIR/bin/python" "$SMOKE_SCRIPT"
fi

echo "library_worker_python=$VENV_DIR/bin/python"
