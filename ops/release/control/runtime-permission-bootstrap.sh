# Controller bootstrap seam for the one runtime permission repair that must run
# after SSH login but before the current deploy tools are synchronized.
reconcile_remote_runtime_permissions() {
  if [ "$WORKSPACE_RUNTIME_PM2_MODE" != "hardened" ]; then
    return 0
  fi
  local controller_reconciler="$SCRIPT_DIR/reconcile-runtime-config-permissions.sh"
  local controller_source="${RELEASE_CONTROLLER_SOURCE_SHA:?Controller Ready source is required for runtime ACL bootstrap}"
  local reconciler_digest
  local remote_bootstrap
  local remote_bootstrap_base64
  [ -f "$controller_reconciler" ] && [ -r "$controller_reconciler" ] \
    || { echo "[错误] Controller Ready runtime ACL reconciler 不可读: $controller_reconciler" >&2; return 1; }
  bash -n "$controller_reconciler"
  reconciler_digest="$(sha256sum --binary "$controller_reconciler" | awk '{print $1}')"
  [[ "$controller_source" =~ ^[0-9a-f]{40}$ ]] \
    || { echo "[错误] Controller Ready source SHA 无效" >&2; return 1; }
  [[ "$reconciler_digest" =~ ^[0-9a-f]{64}$ ]] \
    || { echo "[错误] runtime ACL reconciler SHA-256 无效" >&2; return 1; }
  case "$REMOTE_WORKSPACE_CONFIG_DIR" in
    /*) ;;
    *) echo "[错误] production config root 必须是绝对路径" >&2; return 1 ;;
  esac
  case "$REMOTE_WORKSPACE_CONFIG_DIR" in
    *[!A-Za-z0-9_./-]*) echo "[错误] production config root 包含不安全字符" >&2; return 1 ;;
  esac
  remote_bootstrap="$(
    # This wrapper remains local controller code. Only the reconciler payload
    # travels on stdin; no previously installed remote deploy tool is trusted.
    cat <<'REMOTE_RUNTIME_PERMISSION_BOOTSTRAP'
set -euo pipefail
expected_digest="$1"
config_root="$2"
runtime_user="$3"
controller_source="$4"
payload="$({ /bin/cat; printf '\001'; })"
payload="${payload%$'\001'}"
actual_digest="$(printf '%s' "$payload" | sha256sum --binary | awk '{print $1}')"
if [ "$actual_digest" != "$expected_digest" ]; then
  echo "[错误] Controller runtime ACL bootstrap digest mismatch" >&2
  exit 41
fi
echo "==> Controller runtime ACL bootstrap verified: source=${controller_source} sha256=${actual_digest}"
printf '%s' "$payload" | sudo -n -- /bin/bash -s -- "$config_root" "$runtime_user"
REMOTE_RUNTIME_PERMISSION_BOOTSTRAP
  )"
  remote_bootstrap_base64="$(printf '%s' "$remote_bootstrap" | base64 | tr -d '\n')"
  [[ "$remote_bootstrap_base64" =~ ^[A-Za-z0-9+/=]+$ ]] \
    || { echo "[错误] runtime ACL bootstrap 编码无效" >&2; return 1; }
  echo "==> SSH master 建立后恢复 production runtime ACL: controller=${controller_source:0:12} sha256=$reconciler_digest"
  ssh "${SSH_OPTIONS[@]}" "$SERVER" \
    "/bin/bash -c \"\$(printf '%s' '$remote_bootstrap_base64' | base64 --decode)\" -- '$reconciler_digest' '$REMOTE_WORKSPACE_CONFIG_DIR' workspace-runtime '$controller_source'" \
    < "$controller_reconciler"
}
