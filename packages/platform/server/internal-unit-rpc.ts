import "server-only";

import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const MAX_CLOCK_SKEW_MS = 60_000;
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const PROTOCOL_VERSION = "workspace-internal-api-v1";
const ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const replayClaims = new Map<string, number>();

const INTERNAL_CALLER_HEADER = "x-workspace-internal-caller";
const INTERNAL_AUDIENCE_HEADER = "x-workspace-internal-audience";
const INTERNAL_REQUEST_ID_HEADER = "x-workspace-internal-request-id";
const INTERNAL_TIMESTAMP_HEADER = "x-workspace-internal-timestamp";
const INTERNAL_SIGNATURE_HEADER = "x-workspace-internal-signature";
const INTERNAL_PROTOCOL_HEADER = "x-workspace-internal-protocol";

type InternalApiEnvironment = Partial<Pick<
  NodeJS.ProcessEnv,
  "PORT" | "WORKSPACE_INTERNAL_ORIGIN"
>>;

function internalSecret() {
  const secret = process.env.WORKSPACE_INTERNAL_SERVICE_SECRET?.trim()
    || process.env.NEXTAUTH_SECRET?.trim();
  if (!secret) throw new Error("WORKSPACE_INTERNAL_SERVICE_SECRET or NEXTAUTH_SECRET is required for internal API calls");
  return secret;
}

function canonicalPathname(pathname: string) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() || "/workspace";
  if (basePath === "/") return pathname;
  return pathname === basePath
    ? "/"
    : pathname.startsWith(`${basePath}/`)
      ? pathname.slice(basePath.length)
      : pathname;
}

function requestSignature(input: {
  audience: string;
  body: string;
  caller: string;
  method: string;
  pathname: string;
  requestId: string;
  search: string;
  timestamp: string;
}) {
  const payload = [
    PROTOCOL_VERSION,
    input.caller,
    input.audience,
    input.timestamp,
    input.requestId,
    input.method.toUpperCase(),
    canonicalPathname(input.pathname),
    input.search,
    createHash("sha256").update(input.body).digest("hex"),
  ].join("\n");
  return createHmac("sha256", internalSecret()).update(payload).digest("hex");
}

function validRequestId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
}

function safeEqualHex(left: string, right: string) {
  return DIGEST_PATTERN.test(left)
    && DIGEST_PATTERN.test(right)
    && timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export function workspaceInternalOrigin(env: InternalApiEnvironment = process.env) {
  const configured = env.WORKSPACE_INTERNAL_ORIGIN?.trim();
  if (configured) return configured;
  return `http://127.0.0.1:${env.PORT?.trim() || "3000"}`;
}

export function workspaceInternalApiUrl(pathname: string) {
  if (!pathname.startsWith("/api/")) throw new Error(`Internal unit RPC path is invalid: ${pathname}`);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() || "/workspace";
  return new URL(`${basePath === "/" ? "" : basePath}${pathname}`, workspaceInternalOrigin());
}

export function workspaceInternalRequestHeaders(input: {
  audienceUnitId: string;
  body: string;
  callerUnitId: string;
  method?: string;
  requestId?: string;
  url: URL;
  timestamp?: string;
}) {
  const method = input.method ?? "POST";
  const requestId = input.requestId ?? randomUUID();
  const timestamp = input.timestamp ?? String(Date.now());
  if (!ID_PATTERN.test(input.callerUnitId) || !ID_PATTERN.test(input.audienceUnitId)) {
    throw new Error("Internal API caller or audience is invalid");
  }
  if (!validRequestId(requestId)) throw new Error("Internal API request id is invalid");
  return {
    "Content-Type": "application/json",
    [INTERNAL_PROTOCOL_HEADER]: PROTOCOL_VERSION,
    [INTERNAL_CALLER_HEADER]: input.callerUnitId,
    [INTERNAL_AUDIENCE_HEADER]: input.audienceUnitId,
    [INTERNAL_REQUEST_ID_HEADER]: requestId,
    [INTERNAL_TIMESTAMP_HEADER]: timestamp,
    [INTERNAL_SIGNATURE_HEADER]: requestSignature({
      audience: input.audienceUnitId,
      body: input.body,
      caller: input.callerUnitId,
      method,
      pathname: input.url.pathname,
      requestId,
      search: input.url.search,
      timestamp,
    }),
  };
}

export function isWorkspaceInternalRequestAuthorized(
  request: Request,
  body: string,
  options: {
    allowedCallerUnitIds: readonly string[];
    audienceUnitId: string;
  },
) {
  try {
    const protocol = request.headers.get(INTERNAL_PROTOCOL_HEADER) ?? "";
    const caller = request.headers.get(INTERNAL_CALLER_HEADER) ?? "";
    const audience = request.headers.get(INTERNAL_AUDIENCE_HEADER) ?? "";
    const requestId = request.headers.get(INTERNAL_REQUEST_ID_HEADER) ?? "";
    const timestamp = request.headers.get(INTERNAL_TIMESTAMP_HEADER) ?? "";
    const signature = request.headers.get(INTERNAL_SIGNATURE_HEADER) ?? "";
    const timestampMs = Number(timestamp);
    if (protocol !== PROTOCOL_VERSION
      || !ID_PATTERN.test(caller)
      || !ID_PATTERN.test(audience)
      || audience !== options.audienceUnitId
      || !options.allowedCallerUnitIds.includes(caller)
      || !validRequestId(requestId)
      || !Number.isFinite(timestampMs)
      || Math.abs(Date.now() - timestampMs) > MAX_CLOCK_SKEW_MS) return false;
    const url = new URL(request.url);
    const expected = requestSignature({
      audience,
      body,
      caller,
      method: request.method,
      pathname: url.pathname,
      requestId,
      search: url.search,
      timestamp,
    });
    if (!safeEqualHex(signature, expected)) return false;

    const now = Date.now();
    for (const [claim, expiresAt] of replayClaims) {
      if (expiresAt <= now) replayClaims.delete(claim);
    }
    const claim = createHash("sha256").update(`${caller}\n${audience}\n${requestId}`).digest("hex");
    if (replayClaims.has(claim)) return false;
    replayClaims.set(claim, timestampMs + MAX_CLOCK_SKEW_MS);
    return true;
  } catch {
    return false;
  }
}

export class WorkspaceInternalRpcError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload: Record<string, unknown> | null,
  ) {
    super(message);
    this.name = "WorkspaceInternalRpcError";
  }
}

class WorkspaceInternalRpcResponseLimitError extends Error {
  constructor(readonly maxResponseBytes: number) {
    super(`Internal RPC response exceeded ${maxResponseBytes} bytes`);
    this.name = "WorkspaceInternalRpcResponseLimitError";
  }
}

export async function callWorkspaceInternalJson<T>(input: {
  body: unknown;
  callerUnitId: string;
  maxResponseBytes?: number;
  path: string;
  signal?: AbortSignal;
  targetUnitId: string;
}): Promise<T> {
  if (input.maxResponseBytes !== undefined && (
    !Number.isSafeInteger(input.maxResponseBytes) || input.maxResponseBytes < 1
  )) {
    throw new Error("Internal RPC maxResponseBytes must be a positive safe integer");
  }
  const url = workspaceInternalApiUrl(input.path);
  const body = JSON.stringify(input.body);
  const response = await fetch(url, {
    method: "POST",
    headers: workspaceInternalRequestHeaders({
      audienceUnitId: input.targetUnitId,
      body,
      callerUnitId: input.callerUnitId,
      url,
    }),
    body,
    cache: "no-store",
    signal: input.signal,
  });
  let payload: (T & { error?: string }) | null;
  try {
    payload = await readBoundedJsonResponse<T & { error?: string }>(
      response,
      input.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
    );
  } catch (cause) {
    if (!(cause instanceof WorkspaceInternalRpcResponseLimitError)) throw cause;
    throw new WorkspaceInternalRpcError(
      `Internal ${input.path} RPC response exceeded ${cause.maxResponseBytes} bytes`,
      response.ok ? 413 : response.status,
      null,
    );
  }
  if (!response.ok) {
    throw new WorkspaceInternalRpcError(
      payload?.error || `Internal ${input.path} RPC failed with HTTP ${response.status}`,
      response.status,
      payload && typeof payload === "object" ? payload as Record<string, unknown> : null,
    );
  }
  if (payload === null) {
    throw new WorkspaceInternalRpcError(
      `Internal ${input.path} RPC returned an invalid JSON response`,
      502,
      null,
    );
  }
  return payload;
}

export async function readBoundedJsonResponse<T>(response: Response, maxResponseBytes: number): Promise<T | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  try {
    if (contentLengthExceedsLimit(response.headers.get("content-length"), maxResponseBytes)) {
      await cancelReader(reader, maxResponseBytes);
      throw new WorkspaceInternalRpcResponseLimitError(maxResponseBytes);
    }
    const chunks: Uint8Array[] = [];
    let byteCount = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (!chunk.value?.byteLength) continue;
      if (chunk.value.byteLength > maxResponseBytes - byteCount) {
        await cancelReader(reader, maxResponseBytes);
        throw new WorkspaceInternalRpcResponseLimitError(maxResponseBytes);
      }
      byteCount += chunk.value.byteLength;
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(byteCount);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch (cause) {
    if (cause instanceof WorkspaceInternalRpcResponseLimitError) throw cause;
    return null;
  } finally {
    reader.releaseLock();
  }
}

function contentLengthExceedsLimit(value: string | null, maxResponseBytes: number) {
  return value !== null
    && /^\d+$/.test(value)
    && BigInt(value) > BigInt(maxResponseBytes);
}

async function cancelReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  maxResponseBytes: number,
) {
  try {
    await reader.cancel(`Internal RPC response exceeded ${maxResponseBytes} bytes`);
  } catch {
    // The byte limit is authoritative even when the underlying stream rejects cancellation.
  }
}
