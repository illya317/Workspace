import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const BRIDGE_CLOCK_SKEW_MS = 5 * 60 * 1000;

export function buildWecomAgentBridgeSignature(rawBody: string, timestamp: string, secret: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

function signaturesMatch(actual: string, expected: string) {
  if (!/^[a-f0-9]{64}$/i.test(actual)) return false;
  const actualBuffer = Buffer.from(actual, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function isWecomAgentBridgeRequestAuthorized(request: Request, rawBody: string) {
  const expectedBotId = process.env.WECHAT_BOT_ID?.trim();
  const secret = process.env.WECHAT_BOT_SECRET?.trim();
  if (!expectedBotId || !secret) return false;

  const botId = request.headers.get("x-wecom-bot-id")?.trim() ?? "";
  const timestamp = request.headers.get("x-workspace-timestamp")?.trim() ?? "";
  const signature = request.headers.get("x-workspace-signature")?.trim() ?? "";
  const timestampMs = Number(timestamp);
  if (botId !== expectedBotId || !Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > BRIDGE_CLOCK_SKEW_MS) {
    return false;
  }

  return signaturesMatch(signature, buildWecomAgentBridgeSignature(rawBody, timestamp, secret));
}
