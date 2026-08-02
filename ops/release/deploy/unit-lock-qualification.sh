qualify_apply_deploy_unit_lock() {
  local config_root="$1"
  local lock_file="$2"
  local lock_owner_file="$3"

  [ -n "${DEPLOY_LOCK_TOKEN:-}" ] || {
    echo "[错误] apply-deploy-unit 只能消费已获取的共享 deploy.lock" >&2
    return 73
  }
  test -d "$config_root"
  command -v flock >/dev/null
  [ "$(cat "$lock_owner_file" 2>/dev/null)" = "$DEPLOY_LOCK_TOKEN" ] || {
    echo "[错误] apply-deploy-unit 的共享 deploy.lock token 不匹配" >&2
    return 73
  }
  if flock -n "$lock_file" true; then
    echo "[错误] apply-deploy-unit 未检测到外层持有的共享 deploy.lock" >&2
    return 73
  fi
}
