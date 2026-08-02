#!/usr/bin/env bash

verify_remote_monolith_invariants() {
  ssh "${SSH_OPTIONS[@]}" "$SERVER" \
    "sudo -n -- runuser -u workspace-runtime -- test -x '$REMOTE_DIR/.workspace' && curl --silent --show-error 'http://127.0.0.1:3000/workspace/api/internal/health' | node -e 'let body=\"\"; process.stdin.on(\"data\", (chunk) => body += chunk).on(\"end\", () => { let health; try { health = JSON.parse(body); } catch { console.error(\"monolith health response is invalid\"); process.exit(1); } if (health.status !== \"ok\" || health.unitId !== \"workspace-monolith\") { console.error(\"monolith health invariant failed\"); process.exit(1); } });'"
}

require_remote_monolith_invariants() {
  verify_remote_monolith_invariants || {
    echo "[错误] Unit 操作后共享 runtime ACL 或 monolith health 不满足生产不变量" >&2
    return 1
  }
}
