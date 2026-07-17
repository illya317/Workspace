#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_RUNTIME_DIR="${WORKSPACE_CONFIG_DIR:-}"
ENV_FILE="${WORKSPACE_RUNTIME_DIR:+$WORKSPACE_RUNTIME_DIR/.env}"
COMPOSE_FILE="$SCRIPT_DIR/onlyoffice/docker-compose.yml"
CHECK_ONLY=0

if [ "${1:-}" = "--check" ]; then
  CHECK_ONLY=1
elif [ "$#" -gt 0 ]; then
  echo "用法: WORKSPACE_CONFIG_DIR=/absolute/path $0 [--check]" >&2
  exit 2
fi

if [ -z "$WORKSPACE_RUNTIME_DIR" ] || [ "${WORKSPACE_RUNTIME_DIR#/}" = "$WORKSPACE_RUNTIME_DIR" ]; then
  echo "[错误] WORKSPACE_CONFIG_DIR 必须是绝对路径" >&2
  exit 1
fi
if [ ! -f "$ENV_FILE" ]; then
  echo "[错误] 运行态环境文件不存在: $ENV_FILE" >&2
  exit 1
fi
if [ ! -f "$COMPOSE_FILE" ]; then
  echo "[错误] ONLYOFFICE compose 文件不存在: $COMPOSE_FILE" >&2
  exit 1
fi

ensure_secret() {
  if grep -q '^ONLYOFFICE_JWT_SECRET=.' "$ENV_FILE"; then
    return
  fi
  if [ "$CHECK_ONLY" = "1" ]; then
    echo "[错误] ONLYOFFICE_JWT_SECRET 未配置" >&2
    exit 1
  fi
  umask 077
  printf '\nONLYOFFICE_JWT_SECRET=%s\n' "$(openssl rand -hex 32)" >> "$ENV_FILE"
}

ensure_public_origin() {
  if grep -Eq '^WORKSPACE_PUBLIC_ORIGIN=https?://[^[:space:]]+' "$ENV_FILE"; then
    return
  fi
  local hint="${WORKSPACE_PUBLIC_ORIGIN_HINT:-}"
  if [[ ! "$hint" =~ ^https?://[^/[:space:]]+$ ]] || [[ "$hint" =~ ^https?://(127\.0\.0\.1|localhost)(:|$) ]]; then
    hint="${WECHAT_REDIRECT_ORIGIN:-}"
  fi
  if [[ ! "$hint" =~ ^https?://[^/[:space:]]+$ ]] || [[ "$hint" =~ ^https?://(127\.0\.0\.1|localhost)(:|$) ]]; then
    echo "[错误] WORKSPACE_PUBLIC_ORIGIN 未配置，且部署未提供可用的公网 origin" >&2
    exit 1
  fi
  if [ "$CHECK_ONLY" = "1" ]; then
    echo "[错误] WORKSPACE_PUBLIC_ORIGIN 未配置" >&2
    exit 1
  fi
  umask 077
  printf 'WORKSPACE_PUBLIC_ORIGIN=%s\n' "$hint" >> "$ENV_FILE"
}

load_environment() {
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
  : "${ONLYOFFICE_JWT_SECRET:?ONLYOFFICE_JWT_SECRET 未配置}"
  export ONLYOFFICE_PORT="${ONLYOFFICE_PORT:-8082}"
}

resolve_nginx_site() {
  if [ -n "${ONLYOFFICE_NGINX_SITE:-}" ]; then
    readlink -f "$ONLYOFFICE_NGINX_SITE"
    return
  fi
  local matches=()
  while IFS= read -r candidate; do
    matches+=("$candidate")
  done < <(sudo grep -lE 'location[[:space:]]+(/|\^~[[:space:]]+)?/workspace([[:space:]]|\{)' /etc/nginx/sites-enabled/* 2>/dev/null || true)
  if [ "${#matches[@]}" -ne 1 ]; then
    echo "[错误] 无法唯一识别 Workspace Nginx 站点；请设置 ONLYOFFICE_NGINX_SITE" >&2
    exit 1
  fi
  readlink -f "${matches[0]}"
}

install_nginx_location() {
  local site
  site="$(resolve_nginx_site)"
  if sudo grep -q '# BEGIN workspace-onlyoffice' "$site"; then
    return
  fi
  local temporary
  temporary="$(mktemp)"
  SITE_PATH="$site" ONLYOFFICE_PROXY_PORT="$ONLYOFFICE_PORT" python3 - "$temporary" <<'PY'
import os
from pathlib import Path
import re
import sys

source = Path(os.environ["SITE_PATH"])
target = Path(sys.argv[1])
text = source.read_text(encoding="utf-8")
port = os.environ["ONLYOFFICE_PROXY_PORT"]
if not port.isdigit() or not 1 <= int(port) <= 65535:
    raise SystemExit("ONLYOFFICE_PORT must be a valid TCP port")
match = re.search(r"(?m)^(?P<indent>\s*)location\s+(?:\^~\s+)?/workspace(?:\s|\{)", text)
if not match:
    raise SystemExit("Workspace location not found in Nginx site")
indent = match.group("indent")
block = f'''{indent}# BEGIN workspace-onlyoffice
{indent}location ^~ /workspace/onlyoffice/ {{
{indent}    proxy_pass http://127.0.0.1:{port}/;
{indent}    proxy_http_version 1.1;
{indent}    proxy_set_header Host $http_host;
{indent}    proxy_set_header X-Forwarded-Host $http_host/workspace/onlyoffice;
{indent}    proxy_set_header X-Forwarded-Proto $scheme;
{indent}    proxy_set_header Upgrade $http_upgrade;
{indent}    proxy_set_header Connection "upgrade";
{indent}    proxy_read_timeout 3600s;
{indent}    proxy_send_timeout 3600s;
{indent}}}
{indent}# END workspace-onlyoffice

'''
target.write_text(text[:match.start()] + block + text[match.start():], encoding="utf-8")
PY
  sudo cp "$site" "$site.workspace-onlyoffice.bak"
  sudo install -m 0644 "$temporary" "$site"
  rm -f "$temporary"
  if ! sudo nginx -t; then
    sudo cp "$site.workspace-onlyoffice.bak" "$site"
    echo "[错误] Nginx 配置校验失败，已恢复备份" >&2
    exit 1
  fi
  if ! sudo systemctl reload nginx; then
    sudo cp "$site.workspace-onlyoffice.bak" "$site"
    sudo nginx -t >/dev/null || true
    sudo systemctl reload nginx || true
    echo "[错误] Nginx reload 失败，已恢复备份" >&2
    exit 1
  fi
}

check_runtime() {
  command -v docker >/dev/null
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps --status running --quiet | grep -q .
  curl -fsS "http://127.0.0.1:${ONLYOFFICE_PORT}/healthcheck" | grep -qi true
  local site
  site="$(resolve_nginx_site)"
  sudo grep -q '# BEGIN workspace-onlyoffice' "$site"
  sudo nginx -t >/dev/null
}

ensure_secret
load_environment
ensure_public_origin
load_environment
if [ "$CHECK_ONLY" = "1" ]; then
  check_runtime
  echo "ONLYOFFICE runtime OK"
  exit 0
fi

command -v docker >/dev/null
command -v openssl >/dev/null
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d
install_nginx_location
for _ in $(seq 1 24); do
  if check_runtime; then
    echo "ONLYOFFICE runtime installed"
    exit 0
  fi
  sleep 5
done
echo "[错误] ONLYOFFICE runtime 未在 120 秒内就绪" >&2
exit 1
