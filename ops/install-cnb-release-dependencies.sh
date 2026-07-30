#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

npm ci --no-audit --fund=false --loglevel=error
