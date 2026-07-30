import assert from "node:assert/strict";
import test, { mock } from "node:test";

import type {
  BusinessDocumentIntelligenceRequest,
  BusinessDocumentIntelligenceResponse,
} from "./business-document-intelligence-contract";

type RpcInput = {
  body: unknown;
  callerUnitId: string;
  maxResponseBytes: number;
  path: string;
  targetUnitId: string;
};

const rpcInputs: RpcInput[] = [];
const rpcResponse: BusinessDocumentIntelligenceResponse = {
  operation: "status",
  documents: [],
};

mock.module("server-only", { namedExports: {} } as never);
mock.module("./internal-unit-rpc", {
  namedExports: {
    callWorkspaceInternalJson: async (input: RpcInput) => {
      rpcInputs.push(input);
      return rpcResponse;
    },
  },
} as never);

const { createBusinessDocumentIntelligenceClient } =
  await import("./business-document-intelligence-client");

test("business document intelligence client preserves the configured RPC coordinates", async () => {
  rpcInputs.length = 0;
  const client = createBusinessDocumentIntelligenceClient({
    callerUnitId: "capital-securities",
    targetUnitId: "library",
    routeModuleKey: "library",
  });
  const request: BusinessDocumentIntelligenceRequest = {
    operation: "status",
    requesterId: 7,
    resourceKey: "capitalSecurities.investments",
    documentUids: ["18bb673a-7588-4e73-b5f3-eb77c3cf38c9"],
  };

  const result = await client.call(request);

  assert.equal(result, rpcResponse);
  assert.equal(rpcInputs.length, 1);
  assert.deepEqual(rpcInputs[0], {
    body: request,
    callerUnitId: "capital-securities",
    targetUnitId: "library",
    path: "/api/modules/library/internal/business-document-intelligence",
    maxResponseBytes: 2 * 1024 * 1024,
  });
  assert.equal(rpcInputs[0]?.body, request);
});

test("business document intelligence client rejects an invalid route module key", () => {
  rpcInputs.length = 0;
  assert.throws(
    () => createBusinessDocumentIntelligenceClient({
      callerUnitId: "capital-securities",
      targetUnitId: "library",
      routeModuleKey: "library/internal",
    }),
    /route module key is invalid/,
  );
  assert.equal(rpcInputs.length, 0);
});
