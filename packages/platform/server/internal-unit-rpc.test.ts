import assert from "node:assert/strict";
import test from "node:test";

process.env.NEXTAUTH_SECRET = "internal-unit-test-secret";

const {
  callWorkspaceInternalJson,
  isWorkspaceInternalRequestAuthorized,
  WorkspaceInternalRpcError,
  workspaceInternalRequestHeaders,
} = await import("./internal-unit-rpc");

test("internal unit RPC signs the exact method, path, caller, audience and body", () => {
  const url = new URL("http://127.0.0.1/workspace/api/internal/unit-access?mode=read");
  const body = JSON.stringify({ userId: 7, targetId: 11 });
  const headers = workspaceInternalRequestHeaders({
    audienceUnitId: "work",
    body,
    callerUnitId: "finance",
    timestamp: String(Date.now()),
    url,
  });
  const request = new Request(url, { method: "POST", headers, body });
  const options = { allowedCallerUnitIds: ["finance"], audienceUnitId: "work" };
  assert.equal(isWorkspaceInternalRequestAuthorized(request, body, options), true);
  assert.equal(isWorkspaceInternalRequestAuthorized(request, body, options), false);
  assert.equal(isWorkspaceInternalRequestAuthorized(request, `${body} `, options), false);
});

test("internal unit RPC canonicalizes the Next basePath at the receiver boundary", () => {
  const signedUrl = new URL("http://127.0.0.1/workspace/api/internal/unit-access");
  const receivedUrl = new URL("http://127.0.0.1/api/internal/unit-access");
  const body = JSON.stringify({ userId: 7 });
  const headers = workspaceInternalRequestHeaders({
    audienceUnitId: "work",
    body,
    callerUnitId: "workspace-shell",
    timestamp: String(Date.now()),
    url: signedUrl,
  });
  assert.equal(isWorkspaceInternalRequestAuthorized(
    new Request(receivedUrl, { method: "POST", headers, body }),
    body,
    { allowedCallerUnitIds: ["workspace-shell"], audienceUnitId: "work" },
  ), true);
});

test("internal unit RPC rejects stale and malformed callers", () => {
  const url = new URL("http://127.0.0.1/workspace/api/internal/unit-access");
  const body = "{}";
  const staleHeaders = workspaceInternalRequestHeaders({
    audienceUnitId: "work",
    body,
    callerUnitId: "finance",
    timestamp: String(Date.now() - 120_000),
    url,
  });
  const options = { allowedCallerUnitIds: ["finance"], audienceUnitId: "work" };
  assert.equal(isWorkspaceInternalRequestAuthorized(new Request(url, { method: "POST", headers: staleHeaders, body }), body, options), false);
  const invalidCallerHeaders = new Headers(staleHeaders);
  invalidCallerHeaders.set("x-workspace-internal-caller", "../finance");
  assert.equal(isWorkspaceInternalRequestAuthorized(new Request(url, { method: "POST", headers: invalidCallerHeaders, body }), body, options), false);
});

test("internal unit RPC can restrict an endpoint to explicit caller units", () => {
  const url = new URL("http://127.0.0.1/workspace/api/internal/unit-access");
  const body = "{}";
  const financeHeaders = workspaceInternalRequestHeaders({ audienceUnitId: "work", body, callerUnitId: "finance", url });
  const financeRequest = new Request(url, { method: "POST", headers: financeHeaders, body });
  assert.equal(isWorkspaceInternalRequestAuthorized(financeRequest, body, {
    allowedCallerUnitIds: ["finance"], audienceUnitId: "work",
  }), true);
  assert.equal(isWorkspaceInternalRequestAuthorized(financeRequest, body, {
    allowedCallerUnitIds: ["assistant"], audienceUnitId: "work",
  }), false);
});

test("internal unit RPC parses bounded JSON only after reading the stream within its byte cap", async (t) => {
  const encoder = new TextEncoder();
  t.mock.method(globalThis, "fetch", async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('{"ok":'));
      controller.enqueue(encoder.encode("true}"));
      controller.close();
    },
  })));

  const result = await callWorkspaceInternalJson<{ ok: boolean }>({
    callerUnitId: "finance",
    path: "/api/internal/unit-access",
    targetUnitId: "work",
    body: {},
    maxResponseBytes: 11,
  });

  assert.deepEqual(result, { ok: true });
});

test("internal unit RPC rejects Content-Length above the cap and cancels the reader", async (t) => {
  let cancelled = false;
  t.mock.method(globalThis, "fetch", async () => new Response(new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
  }), { headers: { "content-length": "12" } }));

  await assert.rejects(() => callWorkspaceInternalJson({
    callerUnitId: "finance",
    path: "/api/internal/unit-access",
    targetUnitId: "work",
    body: {},
    maxResponseBytes: 11,
  }), (cause) => {
    assert.equal(cause instanceof WorkspaceInternalRpcError, true);
    assert.equal((cause as InstanceType<typeof WorkspaceInternalRpcError>).status, 413);
    return true;
  });
  assert.equal(cancelled, true);
});

test("internal unit RPC applies a response cap when the caller omits an override", async (t) => {
  let cancelled = false;
  t.mock.method(globalThis, "fetch", async () => new Response(new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
  }), { headers: { "content-length": String(2 * 1024 * 1024 + 1) } }));

  await assert.rejects(() => callWorkspaceInternalJson({
    callerUnitId: "finance",
    path: "/api/internal/unit-access",
    targetUnitId: "work",
    body: {},
  }), (cause) => {
    assert.equal(cause instanceof WorkspaceInternalRpcError, true);
    assert.equal((cause as InstanceType<typeof WorkspaceInternalRpcError>).status, 413);
    return true;
  });
  assert.equal(cancelled, true);
});

test("internal unit RPC maps an invalid successful response to a bad gateway contract error", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("not-json", { status: 200 }));

  await assert.rejects(() => callWorkspaceInternalJson({
    callerUnitId: "finance",
    path: "/api/internal/unit-access",
    targetUnitId: "work",
    body: {},
  }), (cause) => {
    assert.equal(cause instanceof WorkspaceInternalRpcError, true);
    assert.equal((cause as InstanceType<typeof WorkspaceInternalRpcError>).status, 502);
    assert.match((cause as Error).message, /invalid JSON response/);
    return true;
  });
});

test("internal unit RPC enforces the cap across chunks and preserves remote error status", async (t) => {
  const encoder = new TextEncoder();
  let cancelled = false;
  t.mock.method(globalThis, "fetch", async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('{"error":'));
      controller.enqueue(encoder.encode('"too large"}'));
    },
    cancel() {
      cancelled = true;
    },
  }), { status: 504 }));

  await assert.rejects(() => callWorkspaceInternalJson({
    callerUnitId: "finance",
    path: "/api/internal/unit-access",
    targetUnitId: "work",
    body: {},
    maxResponseBytes: 10,
  }), (cause) => {
    assert.equal(cause instanceof WorkspaceInternalRpcError, true);
    assert.equal((cause as InstanceType<typeof WorkspaceInternalRpcError>).status, 504);
    return true;
  });
  assert.equal(cancelled, true);
});
