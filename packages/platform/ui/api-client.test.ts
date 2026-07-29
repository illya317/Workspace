import assert from "node:assert/strict";
import test from "node:test";

import { directCommandFetch, requestDirectCommandJson } from "./api-client";

test("direct command never replays a network failure implicitly", async () => {
  const keys: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    keys.push(new Headers(init?.headers).get("Idempotency-Key") ?? "");
    throw new TypeError("network response was lost");
  }) as typeof fetch;
  try {
    await assert.rejects(directCommandFetch("/api/example", { method: "POST" }), TypeError);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(keys.length, 1);
  assert.ok(keys[0]);
});

test("direct command preserves an integration supplied idempotency key", async () => {
  const originalFetch = globalThis.fetch;
  let received = "";
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    received = new Headers(init?.headers).get("Idempotency-Key") ?? "";
    return Response.json({ success: true });
  }) as typeof fetch;
  try {
    await directCommandFetch("/api/example", {
      method: "POST",
      headers: { "Idempotency-Key": "integration-command-42" },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(received, "integration-command-42");
});

test("JSON command never replays a lost response body implicitly", async () => {
  const keys: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    keys.push(new Headers(init?.headers).get("Idempotency-Key") ?? "");
    return {
      ok: true,
      status: 200,
      json: async () => { throw new TypeError("response body was lost"); },
    } as Response;
  }) as typeof fetch;
  try {
    await assert.rejects(
      requestDirectCommandJson<{ record: { id: number } }>("/api/example", { method: "POST" }),
      TypeError,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(keys.length, 1);
  assert.ok(keys[0]);
});
