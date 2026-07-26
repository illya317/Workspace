import assert from "node:assert/strict";
import test from "node:test";

process.env.WORKSPACE_INTERNAL_ORIGIN = "http://127.0.0.1:3000";

const { createCompatibilityProxyHandler } = await import("./api");

test("compatibility proxy uses the internal HTTP origin behind an HTTPS reverse proxy", async () => {
  const originalFetch = globalThis.fetch;
  const captured: { target?: URL; headers?: Headers } = {};
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    captured.target = new URL(input instanceof Request ? input.url : input.toString());
    captured.headers = new Headers(init?.headers);
    return new Response("proxied", { status: 200 });
  }) as typeof fetch;

  try {
    const handler = createCompatibilityProxyHandler(
      "/internal-target/documents",
      { sourcePathPrefix: "/legacy-target/documents" },
    );
    const response = await handler(new Request(
      "https://fh-bio.cn/workspace/legacy-target/documents/84/versions/91?token=signed",
      { headers: { host: "fh-bio.cn", "x-forwarded-proto": "https" } },
    ));

    assert.equal(response.status, 200);
    assert.equal(
      captured.target?.toString(),
      "http://127.0.0.1:3000/workspace/internal-target/documents/84/versions/91?token=signed",
    );
    assert.equal(captured.headers?.has("host"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
