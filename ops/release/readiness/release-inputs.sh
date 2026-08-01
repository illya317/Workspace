#!/usr/bin/env bash

validate_local_deploy_credentials() {
  [ -n "${SERVER:-}" ] || { echo "[错误] deploy 缺少 SERVER" >&2; return 1; }
  [ -n "${REMOTE_DIR:-}" ] || { echo "[错误] deploy 缺少 REMOTE_DIR" >&2; return 1; }
  case "${HEALTHCHECK_URL:-}" in
    http://*|https://*) ;;
    *) echo "[错误] deploy 缺少有效 HEALTHCHECK_URL" >&2; return 1 ;;
  esac
  if [ -n "${KEY_CONTENT:-}" ]; then return 0; fi
  [ -n "${KEY:-}" ] && [ -f "$KEY" ] || {
    echo "[错误] deploy 必须配置 KEY_CONTENT 或有效 KEY 文件" >&2
    return 1
  }
}

capture_release_configuration_identity() {
  WORKSPACE_CONFIG_DIR="${WORKSPACE_CONFIG_DIR:-${LOCAL_WORKSPACE_CONFIG_DIR:-}}"
  [ -n "$WORKSPACE_CONFIG_DIR" ] || { echo "[错误] WORKSPACE_CONFIG_DIR not set in $OPS_ENV_FILE" >&2; return 1; }
  local tenant_root="$WORKSPACE_CONFIG_DIR/config/tenant"
  [ -d "$tenant_root" ] || { echo "[错误] 租户配置目录不存在: $tenant_root"; return 1; }
  RELEASE_CONFIGURATION_DIGEST="$(node - "$tenant_root" <<'NODE'
const { createHash } = require('node:crypto');
const { lstatSync, readFileSync, readlinkSync, readdirSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(process.argv[2]);
const hash = createHash('sha256');
function walk(directory) {
  for (const name of readdirSync(directory).sort()) {
    const absolute = path.join(directory, name);
    const relative = path.relative(root, absolute).split(path.sep).join('/');
    const stat = lstatSync(absolute);
    if (stat.isDirectory()) {
      hash.update(`dir\0${relative}\0`);
      walk(absolute);
    } else if (stat.isSymbolicLink()) {
      hash.update(`link\0${relative}\0${readlinkSync(absolute)}\0`);
    } else if (stat.isFile()) {
      hash.update(`file\0${relative}\0`);
      hash.update(readFileSync(absolute));
      hash.update('\0');
    } else throw new Error(`unsupported tenant configuration entry: ${relative}`);
  }
}
walk(root);
process.stdout.write(hash.digest('hex'));
NODE
)"
  export WORKSPACE_CONFIG_DIR RELEASE_CONFIGURATION_DIGEST
}
