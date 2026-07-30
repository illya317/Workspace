import { createHmac, randomUUID } from "node:crypto";

export const WECOM_NOTIFICATION_DELIVERY_CONTRACT = Object.freeze({
  endpointKey: "wecom.primary",
  claimPath: "/api/integrations/wecom/notifications/claim",
  resultPathPrefix: "/api/integrations/wecom/notifications/result/",
  heartbeatPath: "/api/integrations/wecom/notifications/heartbeat",
  workerVersion: "workspace-wecom-notification-worker/1",
});

const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_MARKDOWN_BYTES = 19_000;
const MAX_TITLE_BYTES = 512;
const MAX_BODY_BYTES = 16_000;
const MAX_HREF_BYTES = 4_096;
const RESULT_RECEIPT_MAX_ATTEMPTS = 6;
const RESULT_RECEIPT_SAFETY_MS = 5_000;
const WORKER_ID_PATTERN = /^[A-Za-z0-9._:-]{1,120}$/;
const DELIVERY_ID_PATTERN = /^[A-Za-z0-9._:-]{1,180}$/;

class DeliveryPayloadError extends Error {
  constructor(code) {
    super(code);
    this.name = "DeliveryPayloadError";
    this.code = code;
    this.permanentDelivery = true;
  }
}

class DeliveryConfigurationError extends Error {
  constructor(code) {
    super(code);
    this.name = "DeliveryConfigurationError";
    this.code = code;
  }
}

class BridgeRequestError extends Error {
  constructor(code, status) {
    super(code);
    this.name = "BridgeRequestError";
    this.code = code;
    this.status = status;
  }
}

function clampInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum && number <= maximum ? number : fallback;
}

function normalizeBasePath(value) {
  const raw = String(value || "").trim();
  if (!raw || raw === "/") return "";
  if (!raw.startsWith("/") || raw.includes("\\") || raw.includes("?") || raw.includes("#")) {
    throw new Error("NEXT_PUBLIC_BASE_PATH is invalid");
  }
  const normalized = raw.replace(/\/+$/u, "");
  if (normalized.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new Error("NEXT_PUBLIC_BASE_PATH is invalid");
  }
  return normalized;
}

function validateBridgeSecret(secret) {
  if (typeof secret !== "string" || secret.trim().length < 32) {
    throw new Error("WECOM_WORKER_BRIDGE_SECRET must contain at least 32 characters");
  }
  return secret.trim();
}

function validateWorkerId(workerId) {
  if (!WORKER_ID_PATTERN.test(workerId)) throw new Error("WeCom notification worker id is invalid");
  return workerId;
}

function resolveBridgeUrl(bridgeUrl, basePath, contractPath) {
  const origin = new URL(bridgeUrl);
  if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password) {
    throw new Error("WeCom notification bridge URL is invalid");
  }
  return new URL(basePath + contractPath, origin);
}

export function buildWecomWorkerCanonicalRequest({
  timestamp,
  requestId,
  method,
  pathname,
  rawBody,
}) {
  return [
    String(timestamp),
    String(requestId),
    String(method).toUpperCase(),
    String(pathname),
    String(rawBody),
  ].join("\n");
}

export function buildWecomWorkerSignature({
  secret,
  timestamp,
  requestId,
  method,
  pathname,
  rawBody,
}) {
  return createHmac("sha256", validateBridgeSecret(secret))
    .update(buildWecomWorkerCanonicalRequest({ timestamp, requestId, method, pathname, rawBody }))
    .digest("hex");
}

function byteLimited(value, maximumBytes) {
  let output = String(value);
  if (Buffer.byteLength(output, "utf8") <= maximumBytes) return output;
  while (output && Buffer.byteLength(output + "…", "utf8") > maximumBytes) {
    output = output.slice(0, -1);
  }
  return output.replace(/\\$/u, "") + "…";
}

export function escapeWecomNotificationMarkdown(value) {
  return String(value ?? "")
    .replace(/\r\n?/gu, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, " ")
    .replace(/\b([a-z][a-z0-9+.-]{1,20}):\/\//giu, "$1：／／")
    .replace(/\b(mailto|tel):/giu, "$1：")
    .replace(/\bwww\./giu, "www．")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/@/gu, "＠")
    .replace(/([\\\u0060*_[\]()#!~|])/gu, "\\$1");
}

function normalizeRedirectOrigin(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new DeliveryConfigurationError("REDIRECT_ORIGIN_UNAVAILABLE");
  }
  const url = new URL(value.trim());
  if (!["http:", "https:"].includes(url.protocol)
    || url.username
    || url.password
    || (url.pathname !== "/" && url.pathname !== "")
    || url.search
    || url.hash) {
    throw new DeliveryConfigurationError("REDIRECT_ORIGIN_INVALID");
  }
  return url.origin;
}

export function resolveWecomNotificationRedirectOrigin(environment = process.env) {
  const candidate = (environment.WECHAT_REDIRECT_ORIGIN ?? "").trim()
    || (environment.WORKSPACE_PUBLIC_ORIGIN ?? "").trim();
  if (!candidate) {
    throw new DeliveryConfigurationError("REDIRECT_ORIGIN_UNAVAILABLE");
  }
  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new DeliveryConfigurationError("REDIRECT_ORIGIN_INVALID");
  }
  if (!["http:", "https:"].includes(url.protocol)
    || url.username
    || url.password
    || url.search
    || url.hash) {
    throw new DeliveryConfigurationError("REDIRECT_ORIGIN_INVALID");
  }
  return normalizeRedirectOrigin(url.origin);
}

export function workspaceNotificationHref(href, redirectOrigin, basePath = "/workspace") {
  if (href === null || href === undefined || href === "") return null;
  if (typeof href !== "string" || Buffer.byteLength(href, "utf8") > MAX_HREF_BYTES) {
    throw new DeliveryPayloadError("HREF_INVALID");
  }
  if (!href.startsWith("/") || href.startsWith("//") || /[\\\u0000-\u001F\u007F]/u.test(href)) {
    throw new DeliveryPayloadError("HREF_EXTERNAL_OR_UNSAFE");
  }
  const rawPath = href.split(/[?#]/u, 1)[0];
  if (/%(?:2f|5c)/iu.test(rawPath)) throw new DeliveryPayloadError("HREF_ENCODED_SEPARATOR");
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    throw new DeliveryPayloadError("HREF_INVALID_ENCODING");
  }
  if (decodedPath.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new DeliveryPayloadError("HREF_TRAVERSAL");
  }

  const normalizedBasePath = normalizeBasePath(basePath);
  const parsed = new URL(href, "https://workspace.invalid");
  if (parsed.origin !== "https://workspace.invalid") {
    throw new DeliveryPayloadError("HREF_EXTERNAL_OR_UNSAFE");
  }
  const applicationPath = normalizedBasePath
    && (parsed.pathname === normalizedBasePath || parsed.pathname.startsWith(normalizedBasePath + "/"))
    ? parsed.pathname.slice(normalizedBasePath.length) || "/"
    : parsed.pathname;
  if (applicationPath === "/api" || applicationPath.startsWith("/api/")) {
    throw new DeliveryPayloadError("HREF_API_PATH_FORBIDDEN");
  }
  const finalPath = normalizedBasePath
    && (parsed.pathname === normalizedBasePath || parsed.pathname.startsWith(normalizedBasePath + "/"))
    ? parsed.pathname
    : normalizedBasePath + parsed.pathname;
  const absolute = new URL(finalPath + parsed.search + parsed.hash, normalizeRedirectOrigin(redirectOrigin));
  return absolute.toString()
    .replace(/@/gu, "%40")
    .replace(/\(/gu, "%28")
    .replace(/\)/gu, "%29");
}

export function formatWecomNotificationMarkdown(delivery, {
  redirectOrigin,
  basePath = "/workspace",
} = {}) {
  if (!delivery || typeof delivery !== "object") throw new DeliveryPayloadError("DELIVERY_INVALID");
  if (typeof delivery.title !== "string" || typeof delivery.body !== "string") {
    throw new DeliveryPayloadError("CONTENT_INVALID");
  }
  if (Buffer.byteLength(delivery.title, "utf8") > 100_000
    || Buffer.byteLength(delivery.body, "utf8") > 500_000) {
    throw new DeliveryPayloadError("CONTENT_TOO_LARGE");
  }
  const title = byteLimited(
    escapeWecomNotificationMarkdown(delivery.title.trim() || "Workspace 通知"),
    MAX_TITLE_BYTES,
  );
  const body = byteLimited(escapeWecomNotificationMarkdown(delivery.body), MAX_BODY_BYTES);
  const href = workspaceNotificationHref(delivery.href, redirectOrigin, basePath);
  const sections = ["**" + title + "**"];
  if (body.trim()) sections.push(body);
  if (href) sections.push("[在 Workspace 查看](" + href + ")");
  const markdown = sections.join("\n\n");
  if (Buffer.byteLength(markdown, "utf8") > MAX_MARKDOWN_BYTES) {
    throw new DeliveryPayloadError("MARKDOWN_TOO_LARGE");
  }
  return markdown;
}

function safeErrorCode(error) {
  if (Number.isInteger(error?.errcode)) return "WECOM_" + String(error.errcode).slice(0, 24);
  if (Number.isInteger(error?.status)) return "HTTP_" + String(error.status);
  const candidate = typeof error?.code === "string" ? error.code : "";
  return /^[A-Za-z0-9._:-]{1,64}$/u.test(candidate) ? candidate : "WECOM_DELIVERY_ERROR";
}

function classifyDeliveryFailure(error) {
  const permanent = error instanceof DeliveryPayloadError
    || error?.permanentDelivery === true
    || error?.retryable === false;
  return {
    outcome: permanent ? "permanent_failure" : "retryable_failure",
    errorCode: safeErrorCode(error),
    errorSummary: permanent
      ? "The delivery payload was rejected by the WeCom worker"
      : "WeCom did not acknowledge the delivery",
  };
}

function safeProviderMessageId(frame) {
  const value = frame?.headers?.req_id ?? frame?.req_id ?? frame?.messageId;
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,180}$/u.test(value) ? value : undefined;
}

function deliveryIdentity(value) {
  if (!value || typeof value !== "object") throw new DeliveryPayloadError("DELIVERY_INVALID");
  const rawId = value.id ?? value.deliveryId;
  const id = Number.isSafeInteger(rawId) && rawId > 0 ? String(rawId) : rawId;
  const leaseToken = value.leaseToken;
  const attemptNo = value.attemptNo;
  const leaseExpiresAt = Date.parse(value.leaseExpiresAt);
  if (typeof id !== "string" || !DELIVERY_ID_PATTERN.test(id)) {
    throw new DeliveryPayloadError("DELIVERY_ID_INVALID");
  }
  if (typeof leaseToken !== "string" || !leaseToken || leaseToken.length > 1_024) {
    throw new DeliveryPayloadError("LEASE_TOKEN_INVALID");
  }
  if (!Number.isInteger(attemptNo) || attemptNo < 1) {
    throw new DeliveryPayloadError("ATTEMPT_INVALID");
  }
  if (!Number.isFinite(leaseExpiresAt)) {
    throw new DeliveryPayloadError("LEASE_EXPIRY_INVALID");
  }
  return { id, leaseToken, attemptNo, leaseExpiresAt };
}

function deliveryForSend(value, identity) {
  const destination = value.destination ?? value.userid;
  if (typeof destination !== "string" || !destination.trim() || destination.length > 256) {
    throw new DeliveryPayloadError("DESTINATION_INVALID");
  }
  if (value.href !== null && value.href !== undefined && typeof value.href !== "string") {
    throw new DeliveryPayloadError("HREF_INVALID");
  }
  return {
    ...identity,
    destination: destination.trim(),
    title: value.title,
    body: value.body,
    href: value.href ?? null,
  };
}

function safeLog(logger, level, event, fields = {}) {
  const method = typeof logger?.[level] === "function" ? logger[level].bind(logger) : undefined;
  if (!method) return;
  const suffix = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => key + "=" + String(value).replace(/[^A-Za-z0-9._:-]/gu, "_").slice(0, 180))
    .join(" ");
  method("[wecom-notification] " + event + (suffix ? " " + suffix : ""));
}

function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function retryableResultReceiptError(error) {
  if (!(error instanceof BridgeRequestError)) return false;
  if (error.code === "BRIDGE_RESPONSE_UNAVAILABLE" || error.code === "BRIDGE_INVALID_JSON") {
    return true;
  }
  return error.status === undefined
    || error.status === 408
    || error.status === 429
    || error.status >= 500;
}

export function createWecomNotificationDeliveryWorker({
  client,
  bridgeUrl,
  bridgeSecret,
  redirectOrigin,
  basePath = "/workspace",
  endpointKey = WECOM_NOTIFICATION_DELIVERY_CONTRACT.endpointKey,
  workerId = "wecom-primary-" + process.pid + "-" + randomUUID(),
  fetchImpl = globalThis.fetch,
  logger = console,
  pollIntervalMs = 1_000,
  heartbeatIntervalMs = 30_000,
  requestTimeoutMs = 10_000,
  resultRetryBaseMs = 250,
  now = () => Date.now(),
  requestIdFactory = () => randomUUID(),
  waitImpl = wait,
} = {}) {
  if (!client || typeof client.sendMessage !== "function") {
    throw new Error("A connected WeCom WSClient is required");
  }
  if (typeof fetchImpl !== "function") throw new Error("fetch is required");
  const secret = validateBridgeSecret(bridgeSecret);
  const normalizedBasePath = normalizeBasePath(basePath);
  const normalizedWorkerId = validateWorkerId(workerId);
  if (endpointKey !== WECOM_NOTIFICATION_DELIVERY_CONTRACT.endpointKey) {
    throw new Error("Unsupported WeCom notification endpoint key");
  }
  const bridge = new URL(bridgeUrl);
  const pollInterval = clampInteger(pollIntervalMs, 1_000, 250, 60_000);
  const heartbeatInterval = clampInteger(heartbeatIntervalMs, 30_000, 5_000, 300_000);
  const requestTimeout = clampInteger(requestTimeoutMs, 10_000, 1_000, 60_000);
  const resultRetryBase = clampInteger(resultRetryBaseMs, 250, 50, 5_000);

  async function postJson(contractPath, body, request = {}) {
    const url = resolveBridgeUrl(bridge, normalizedBasePath, contractPath);
    const method = "POST";
    const rawBody = request.rawBody ?? JSON.stringify(body);
    const timestamp = String(now());
    const requestId = request.requestId ?? requestIdFactory();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeout);
    timeout.unref?.();
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-wecom-endpoint-key": endpointKey,
          "x-workspace-timestamp": timestamp,
          "x-workspace-request-id": requestId,
          "x-workspace-signature": buildWecomWorkerSignature({
            secret,
            timestamp,
            requestId,
            method,
            pathname: url.pathname,
            rawBody,
          }),
        },
        body: rawBody,
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeout);
      throw new BridgeRequestError(error?.name === "AbortError" ? "BRIDGE_TIMEOUT" : "BRIDGE_UNAVAILABLE");
    }
    let text;
    try {
      text = await response.text();
    } catch {
      throw new BridgeRequestError("BRIDGE_RESPONSE_UNAVAILABLE", response.status);
    } finally {
      clearTimeout(timeout);
    }
    if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
      throw new BridgeRequestError("BRIDGE_RESPONSE_TOO_LARGE", response.status);
    }
    if (!response.ok) throw new BridgeRequestError("BRIDGE_HTTP_" + response.status, response.status);
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new BridgeRequestError("BRIDGE_INVALID_JSON", response.status);
    }
  }

  async function claimDelivery() {
    const response = await postJson(
      WECOM_NOTIFICATION_DELIVERY_CONTRACT.claimPath,
      { workerId: normalizedWorkerId, limit: 1 },
    );
    if (!response || response.endpointKey !== endpointKey) {
      throw new BridgeRequestError("CLAIM_ENDPOINT_MISMATCH");
    }
    const deliveries = Array.isArray(response.deliveries)
      ? response.deliveries
      : response.delivery
        ? [response.delivery]
        : [];
    if (deliveries.length > 1) {
      safeLog(logger, "warn", "claim_overflow", { count: deliveries.length });
    }
    return deliveries[0] ?? null;
  }

  async function postResult(identity, result) {
    const body = {
      workerId: normalizedWorkerId,
      leaseToken: identity.leaseToken,
      attemptNo: identity.attemptNo,
      ...result,
    };
    const request = {
      requestId: requestIdFactory(),
      rawBody: JSON.stringify(body),
    };
    let retryDelay = resultRetryBase;
    for (let attempt = 1; attempt <= RESULT_RECEIPT_MAX_ATTEMPTS; attempt += 1) {
      try {
        const acknowledgement = await postJson(
          WECOM_NOTIFICATION_DELIVERY_CONTRACT.resultPathPrefix + encodeURIComponent(identity.id),
          body,
          request,
        );
        if (
          !acknowledgement
          || typeof acknowledgement !== "object"
          || String(acknowledgement.deliveryId) !== identity.id
          || !["delivered", "retrying", "failed"].includes(acknowledgement.status)
        ) {
          throw new BridgeRequestError("RESULT_RECEIPT_INVALID");
        }
        return acknowledgement;
      } catch (error) {
        const retryDeadline = identity.leaseExpiresAt - RESULT_RECEIPT_SAFETY_MS;
        const canRetry = attempt < RESULT_RECEIPT_MAX_ATTEMPTS
          && retryableResultReceiptError(error)
          && now() + retryDelay < retryDeadline;
        if (!canRetry) throw error;
        safeLog(logger, "warn", "result_receipt_retry", {
          deliveryId: identity.id,
          attempt,
          errorCode: safeErrorCode(error),
        });
        await waitImpl(retryDelay);
        retryDelay = Math.min(retryDelay * 2, 5_000);
      }
    }
    throw new BridgeRequestError("RESULT_RECEIPT_UNCONFIRMED");
  }

  async function processDelivery(rawDelivery) {
    const identity = deliveryIdentity(rawDelivery);
    let result;
    try {
      const delivery = deliveryForSend(rawDelivery, identity);
      const markdown = formatWecomNotificationMarkdown(delivery, {
        redirectOrigin,
        basePath: normalizedBasePath,
      });
      const acknowledgement = await client.sendMessage(delivery.destination, {
        msgtype: "markdown",
        markdown: { content: markdown },
      });
      result = { outcome: "delivered" };
      const providerMessageId = safeProviderMessageId(acknowledgement);
      if (providerMessageId) result.providerMessageId = providerMessageId;
    } catch (error) {
      result = classifyDeliveryFailure(error);
    }
    await postResult(identity, result);
    safeLog(logger, result.outcome === "delivered" ? "info" : "warn", "delivery_result", {
      deliveryId: identity.id,
      outcome: result.outcome,
      errorCode: result.errorCode,
    });
    return { claimed: true, deliveryId: identity.id, outcome: result.outcome };
  }

  async function executePoll() {
    const delivery = await claimDelivery();
    if (!delivery) return { claimed: false };
    return processDelivery(delivery);
  }

  let pollPromise = null;
  function pollOnce() {
    if (!pollPromise) {
      pollPromise = executePoll().finally(() => {
        pollPromise = null;
      });
    }
    return pollPromise;
  }

  async function heartbeat(connected) {
    await postJson(WECOM_NOTIFICATION_DELIVERY_CONTRACT.heartbeatPath, {
      workerId: normalizedWorkerId,
      connected,
      workerVersion: WECOM_NOTIFICATION_DELIVERY_CONTRACT.workerVersion,
    });
  }

  let shouldRun = false;
  let loopPromise = null;
  let wakeWait = null;

  function waitForNextPoll() {
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (wakeWait === finish) wakeWait = null;
        resolve();
      };
      const timer = setTimeout(finish, pollInterval);
      timer.unref?.();
      wakeWait = finish;
    });
  }

  async function runLoop() {
    safeLog(logger, "info", "worker_started");
    let nextHeartbeatAt = 0;
    try {
      while (shouldRun) {
        if (now() >= nextHeartbeatAt) {
          try {
            await heartbeat(true);
          } catch (error) {
            safeLog(logger, "warn", "heartbeat_failed", { errorCode: safeErrorCode(error) });
          }
          nextHeartbeatAt = now() + heartbeatInterval;
        }
        if (!shouldRun) break;
        try {
          await pollOnce();
        } catch (error) {
          safeLog(logger, "warn", "poll_failed", { errorCode: safeErrorCode(error) });
        }
        if (shouldRun) await waitForNextPoll();
      }
    } finally {
      if (!shouldRun) {
        try {
          await heartbeat(false);
        } catch (error) {
          safeLog(logger, "warn", "disconnect_heartbeat_failed", { errorCode: safeErrorCode(error) });
        }
      }
      loopPromise = null;
      safeLog(logger, "info", "worker_stopped");
      if (shouldRun) start();
    }
  }

  function start() {
    shouldRun = true;
    if (loopPromise) return false;
    loopPromise = runLoop();
    return true;
  }

  async function stop() {
    shouldRun = false;
    wakeWait?.();
    const pendingLoop = loopPromise;
    if (pendingLoop) await pendingLoop;
    else if (pollPromise) await pollPromise;
  }

  return Object.freeze({
    start,
    stop,
    pollOnce,
    isRunning: () => shouldRun && Boolean(loopPromise),
    workerId: normalizedWorkerId,
  });
}
