verify_control_plane_release() {
  echo "==> 校验 control-plane lifecycle 回执..."
  ssh_cmd "node '$REMOTE_CONTROL_PLANE_RECEIPT_TOOL' inspect --file '$REMOTE_CONTROL_PLANE_RECEIPT' >/dev/null"
}

run_healthcheck() {
  echo "==> 健康检查与 runtime 版本复验..."
  ssh_cmd "
    health_status=0
    version_status=0
    if ! curl --max-time 15 -fsS '$HEALTHCHECK_URL' >/dev/null; then
      echo '[错误] post-deploy public health check failed' >&2
      health_status=1
    fi
    version_response=''
    if ! version_response=\$(curl --max-time 15 -fsS 'http://127.0.0.1:3000/workspace/api/settings/version'); then
      echo '[错误] post-deploy version endpoint request failed' >&2
      version_status=1
    elif ! VERSION_RESPONSE=\"\$version_response\" EXPECTED_VERSION='$RELEASE_CONTENT_DIGEST' node - <<'NODE'
const payload = JSON.parse(process.env.VERSION_RESPONSE || 'null');
if (!payload || payload.version !== process.env.EXPECTED_VERSION) {
  throw new Error('post-deploy version endpoint does not match candidate content digest');
}
NODE
    then
      version_status=1
    fi
    if [ \"\$health_status\" -ne 0 ] || [ \"\$version_status\" -ne 0 ]; then
      echo \"[错误] post-deploy verification failed: health=\$health_status version=\$version_status\" >&2
      exit 1
    fi
  "
}
