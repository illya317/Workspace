import assert from "node:assert/strict";
import test, { before, mock } from "node:test";

process.env.NEXTAUTH_SECRET = "inventory-closing-route-test-secret";

function jsonErrorResponse(error: string, status: number) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

mock.module("server-only", { namedExports: {} } as never);
mock.module("@workspace/platform/server/api", {
  namedExports: { jsonErrorResponse },
} as never);
mock.module("@workspace/platform/server/api-route", {
  namedExports: {
    createInternalApiRoute: (options: {
      authorize: (context: { request: Request }) => Promise<boolean> | boolean;
      authorizeError?: string;
      handler: (context: { request: Request }) => Promise<unknown> | unknown;
    }) => async (request: Request) => {
      if (!await options.authorize({ request })) {
        return jsonErrorResponse(options.authorizeError || "无权限", 403);
      }
      const result = await options.handler({ request });
      return result instanceof Response ? result : Response.json(result);
    },
  },
} as never);
mock.module("@workspace/inventory/server/closing-adapter", {
  namedExports: {
    inventoryClosingAdapter: {
      inspectPeriodRecords: async (scope: unknown) => ({
        status: "ready",
        inspectionVersion: "test-v1",
        blockers: [],
        evidenceRefs: [],
        voucherRefs: [],
        deepLink: "/inventory/operations",
        payload: { scope },
      }),
      inspectPeriodCountDifferences: async () => {
        throw new Error("unexpected count inspection");
      },
    },
  },
} as never);

let workspaceInternalRequestHeaders: typeof import("@workspace/platform/server/internal-unit-rpc")["workspaceInternalRequestHeaders"];
let POST: typeof import("./route")["POST"];

before(async () => {
  ({ workspaceInternalRequestHeaders } = await import("@workspace/platform/server/internal-unit-rpc"));
  ({ POST } = await import("./route"));
});

const url = new URL("http://127.0.0.1/workspace/api/modules/inventory/internal/closing-inspection");
const validBody = JSON.stringify({
  inspectionKind: "records",
  scope: { companyCode: "C01", year: 2026, month: 6 },
});

function signedRequest(body = validBody, signedBody = body) {
  return new Request(url, {
    method: "POST",
    headers: workspaceInternalRequestHeaders({
      audienceUnitId: "inventory",
      callerUnitId: "finance",
      body: signedBody,
      url,
    }),
    body,
  });
}

test("Inventory closing internal route authenticates the untouched raw body before parsing it", async () => {
  const response = await POST(signedRequest());
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.status, "ready");
  assert.deepEqual(payload.payload.scope, { companyCode: "C01", year: 2026, month: 6 });
});

test("Inventory closing internal route rejects a body changed after signing", async () => {
  const response = await POST(signedRequest(
    JSON.stringify({ inspectionKind: "records", scope: { companyCode: "C02", year: 2026, month: 6 } }),
    validBody,
  ));
  assert.equal(response.status, 403);
});
