import "server-only";

import {
  authenticateWorkspaceInternalRequest,
  consumeWorkspaceInternalRequestPrincipal,
  createWorkspaceInternalIdentityHeaders,
} from "./internal-unit-identity";

const MAX_CLOCK_SKEW_MS = 60_000;
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

type InternalRpcEnvironment = Pick<
  NodeJS.ProcessEnv,
  "NODE_ENV" | "PORT" | "WORKSPACE_INTERNAL_ORIGIN" | "WORKSPACE_PUBLIC_ORIGIN"
>;

export function workspaceInternalOrigin(env: InternalRpcEnvironment = process.env) {
  const configured = env.WORKSPACE_INTERNAL_ORIGIN?.trim();
  if (configured) return configured;
  if (env.NODE_ENV === "production") {
    // Production internal RPC must pass through the managed Gateway so an
    // independently activated unit receives its owned API routes. The bare
    // loopback origin can select an unrelated default Nginx vhost and fail
    // before the signed request reaches Workspace.
    return env.WORKSPACE_PUBLIC_ORIGIN?.trim() || "http://127.0.0.1";
  }
  return `http://127.0.0.1:${env.PORT?.trim() || "3000"}`;
}

function internalUrl(pathname: string) {
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
  return {
    "Content-Type": "application/json",
    ...createWorkspaceInternalIdentityHeaders({
      audienceUnitId: input.audienceUnitId,
      body: input.body,
      callerUnitId: input.callerUnitId,
      method,
      pathname: input.url.pathname,
      search: input.url.search,
      requestId: input.requestId,
      timestamp: input.timestamp,
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
  const principal = authenticateWorkspaceInternalRequest({
    audienceUnitId: options.audienceUnitId,
    body,
    maxClockSkewMs: MAX_CLOCK_SKEW_MS,
    request,
  });
  return principal !== null
    && options.allowedCallerUnitIds.includes(principal.callerUnitId)
    && consumeWorkspaceInternalRequestPrincipal(principal);
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
  const url = internalUrl(input.path);
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
    payload = await readBoundedJson<T & { error?: string }>(
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

async function readBoundedJson<T>(response: Response, maxResponseBytes: number): Promise<T | null> {
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
