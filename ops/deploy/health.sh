verify_control_plane_release() {
  echo "==> 校验 control-plane lifecycle 回执..."
  ssh_cmd "node '$REMOTE_CONTROL_PLANE_RECEIPT_TOOL' inspect --file '$REMOTE_CONTROL_PLANE_RECEIPT' >/dev/null"
}

run_healthcheck() {
  echo "==> 健康检查与 runtime 版本复验..."
  ssh_cmd "
    set -e
    curl -fsS '$HEALTHCHECK_URL' >/dev/null
    version_response=\$(curl -fsS 'http://127.0.0.1:3000/workspace/api/settings/version')
    VERSION_RESPONSE=\"\$version_response\" EXPECTED_VERSION='$RELEASE_CONTENT_DIGEST' node - <<'NODE'
const payload = JSON.parse(process.env.VERSION_RESPONSE || 'null');
if (!payload || payload.version !== process.env.EXPECTED_VERSION) {
  throw new Error('post-deploy version endpoint does not match candidate content digest');
}
NODE
  "
}
