import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export const WECOM_NOTIFICATION_ENDPOINT_KEY = "wecom.primary";
export const WECOM_NOTIFICATION_WORKER_CLOCK_SKEW_MS = 5 * 60 * 1_000;

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SIGNATURE_PATTERN = /^[a-f0-9]{64}$/i;

export type WecomNotificationWorkerAuthentication =
  | { ok: true; endpointKey: typeof WECOM_NOTIFICATION_ENDPOINT_KEY; requestId: string }
  | { ok: false; status: 401 | 503; error: string };

export function buildWecomNotificationWorkerSignature(input: {
  secret: string;
  timestamp: string;
  requestId: string;
  method: string;
  pathname: string;
  rawBody: string;
}) {
  const canonical = [
    input.timestamp,
    input.requestId,
    input.method.toUpperCase(),
    input.pathname,
    input.rawBody,
  ].join("\n");
  return createHmac("sha256", input.secret).update(canonical).digest("hex");
}

export function authenticateWecomNotificationWorkerRequest(
  request: Request,
  rawBody: string,
  nowMs = Date.now(),
): WecomNotificationWorkerAuthentication {
  const secret = process.env.WECOM_WORKER_BRIDGE_SECRET?.trim();
  if (!secret || secret.length < 32) {
    return { ok: false, status: 503, error: "企业微信通知 Worker bridge 未配置" };
  }

  const endpointKey = request.headers.get("x-wecom-endpoint-key")?.trim() ?? "";
  const timestamp = request.headers.get("x-workspace-timestamp")?.trim() ?? "";
  const requestId = request.headers.get("x-workspace-request-id")?.trim() ?? "";
  const signature = request.headers.get("x-workspace-signature")?.trim() ?? "";
  const timestampMs = Number(timestamp);
  if (
    endpointKey !== WECOM_NOTIFICATION_ENDPOINT_KEY
    || !REQUEST_ID_PATTERN.test(requestId)
    || !Number.isSafeInteger(timestampMs)
    || Math.abs(nowMs - timestampMs) > WECOM_NOTIFICATION_WORKER_CLOCK_SKEW_MS
    || !SIGNATURE_PATTERN.test(signature)
  ) {
    return { ok: false, status: 401, error: "Invalid WeCom notification worker authentication" };
  }

  const expected = buildWecomNotificationWorkerSignature({
    secret,
    timestamp,
    requestId,
    method: request.method,
    pathname: new URL(request.url).pathname,
    rawBody,
  });
  return signaturesMatch(signature, expected)
    ? { ok: true, endpointKey: WECOM_NOTIFICATION_ENDPOINT_KEY, requestId }
    : { ok: false, status: 401, error: "Invalid WeCom notification worker authentication" };
}

function signaturesMatch(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actualBuffer.length === expectedBuffer.length
    && timingSafeEqual(actualBuffer, expectedBuffer);
}
