#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE_DIR="${REMOTE_DIR:-}"
RECEIPT_FILE="${1:-}"
if [ "$#" -ne 1 ] || [ ! -f "$RECEIPT_FILE" ]; then
  echo "用法: $0 <profile-promotion-receipt.json>" >&2
  exit 2
fi
if [ -z "$REMOTE_DIR" ] || [ "${REMOTE_DIR#/}" = "$REMOTE_DIR" ]; then
  echo "[错误] REMOTE_DIR 必须是绝对路径" >&2
  exit 1
fi
CONFIG_ROOT="$REMOTE_DIR/.workspace"
LOCK_FILE="$CONFIG_ROOT/deploy.lock"
mkdir -p "$CONFIG_ROOT"
command -v flock >/dev/null
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[错误] 另一生产部署正在运行" >&2
  exit 73
fi
node "$SCRIPT_DIR/deployment-profile-promotion.mjs" receipt-assert --receipt "$RECEIPT_FILE" >/dev/null
PROMOTED_GENERATION_ID="$(node -e '
const value=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8"));
if (!/^[0-9a-f]{64}$/.test(value.generationId ?? "")) throw new Error("profile promotion generation is invalid");
process.stdout.write(value.generationId);
' "$RECEIPT_FILE")"
PREVIOUS_GENERATION_ID="$(node -e '
const value=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8"));
if (!/^[0-9a-f]{64}$/.test(value.previousGenerationId ?? "")) throw new Error("profile promotion has no rollback generation");
process.stdout.write(value.previousGenerationId);
' "$RECEIPT_FILE")"
GATEWAY_ROOT="$REMOTE_DIR/.workspace/gateway"
CURRENT_ROUTE_MAP="$GATEWAY_ROOT/current/route-map.json"
[ -f "$CURRENT_ROUTE_MAP" ] || { echo "[错误] 当前 Gateway route map 不存在" >&2; exit 1; }
CURRENT_GENERATION_ID="$(node -e '
const value=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8"));
if (!/^[0-9a-f]{64}$/.test(value.generationId ?? "")) throw new Error("current Gateway generation is invalid");
process.stdout.write(value.generationId);
' "$CURRENT_ROUTE_MAP")"
[ "$CURRENT_GENERATION_ID" = "$PROMOTED_GENERATION_ID" ] || {
  echo "[错误] promotion receipt 已过期：当前 Gateway generation 已变化" >&2
  exit 1
}
TARGET="$GATEWAY_ROOT/generations/$PREVIOUS_GENERATION_ID"
[ -d "$TARGET" ] || { echo "[错误] rollback Gateway generation 不存在" >&2; exit 1; }
WORKSPACE_GATEWAY_ROOT="$GATEWAY_ROOT" \
  WORKSPACE_GATEWAY_NGINX_SITE="${WORKSPACE_GATEWAY_NGINX_SITE:-}" \
  "$SCRIPT_DIR/switch-deploy-gateway.sh" --generation "$TARGET"
echo "Workspace profile rolled back to Gateway generation $PREVIOUS_GENERATION_ID"
