import assert from "node:assert/strict";
import test from "node:test";

import {
  authenticateWecomNotificationWorkerRequest,
  buildWecomNotificationWorkerSignature,
  WECOM_NOTIFICATION_ENDPOINT_KEY,
} from "./wecom-notification-worker-auth";

const secret = "worker-bridge-test-secret-32-bytes-minimum";
const now = 1_785_427_200_000;
const pathname = "/test/api/integrations/wecom/notifications/claim";
const rawBody = JSON.stringify({ workerId: "worker-a", limit: 20 });

test("worker authentication binds endpoint, request id, method, path, and raw body", () => {
  const previous = process.env.WECOM_WORKER_BRIDGE_SECRET;
  process.env.WECOM_WORKER_BRIDGE_SECRET = secret;
  try {
    const timestamp = String(now);
    const requestId = "request-001";
    const signature = buildWecomNotificationWorkerSignature({
      secret,
      timestamp,
      requestId,
      method: "POST",
      pathname,
      rawBody,
    });
    const request = new Request(`https://workspace.invalid${pathname}`, {
      method: "POST",
      headers: {
        "x-wecom-endpoint-key": WECOM_NOTIFICATION_ENDPOINT_KEY,
        "x-workspace-timestamp": timestamp,
        "x-workspace-request-id": requestId,
        "x-workspace-signature": signature,
      },
      body: rawBody,
    });
    assert.deepEqual(authenticateWecomNotificationWorkerRequest(request, rawBody, now), {
      ok: true,
      endpointKey: WECOM_NOTIFICATION_ENDPOINT_KEY,
      requestId,
    });
    assert.equal(authenticateWecomNotificationWorkerRequest(request, `${rawBody} `, now).ok, false);
    assert.equal(authenticateWecomNotificationWorkerRequest(
      new Request(`https://workspace.invalid${pathname}/tampered`, {
        method: "POST",
        headers: request.headers,
        body: rawBody,
      }),
      rawBody,
      now,
    ).ok, false);
    assert.equal(authenticateWecomNotificationWorkerRequest(request, rawBody, now + 5 * 60_000 + 1).ok, false);
  } finally {
    restoreEnv("WECOM_WORKER_BRIDGE_SECRET", previous);
  }
});

test("worker authentication never falls back to the existing bot secret", () => {
  const previousBridge = process.env.WECOM_WORKER_BRIDGE_SECRET;
  const previousBot = process.env.WECHAT_BOT_SECRET;
  delete process.env.WECOM_WORKER_BRIDGE_SECRET;
  process.env.WECHAT_BOT_SECRET = secret;
  try {
    const request = new Request(`https://workspace.invalid${pathname}`, { method: "POST", body: rawBody });
    const result = authenticateWecomNotificationWorkerRequest(request, rawBody, now);
    assert.deepEqual(result, { ok: false, status: 503, error: "企业微信通知 Worker bridge 未配置" });
  } finally {
    restoreEnv("WECOM_WORKER_BRIDGE_SECRET", previousBridge);
    restoreEnv("WECHAT_BOT_SECRET", previousBot);
  }
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
