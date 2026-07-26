#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export DEPLOY_EXECUTION_MODE=control-plane-only
export CONTROL_PLANE_POLICY=refresh
exec "$SCRIPT_DIR/deploy.sh" "$@"
