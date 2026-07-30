import assert from "node:assert/strict";
import test, { mock } from "node:test";

import type {
  BusinessDocumentIntelligenceRequest,
  BusinessDocumentIntelligenceResponse,
} from "@workspace/platform/server/business-document-intelligence-contract";

const factoryCalls: unknown[][] = [];
const delegatedCalls: unknown[][] = [];
const clientResponse: BusinessDocumentIntelligenceResponse = {
  operation: "status",
  documents: [],
};

mock.module("server-only", { namedExports: {} } as never);
mock.module("@workspace/platform/server/business-document-intelligence-client", {
  namedExports: {
    createBusinessDocumentIntelligenceClient: (...args: unknown[]) => {
      factoryCalls.push(args);
      return {
        call: async (...callArgs: unknown[]) => {
          delegatedCalls.push(callArgs);
          return clientResponse;
        },
      };
    },
  },
} as never);

const { callBusinessDocumentIntelligence } =
  await import("./business-document-intelligence-client");

test("capital securities keeps business document intelligence routing in its private adapter", async () => {
  assert.deepEqual(factoryCalls, [[{
    callerUnitId: "capital-securities",
    targetUnitId: "library",
    routeModuleKey: "library",
  }]]);

  const request: BusinessDocumentIntelligenceRequest = {
    operation: "status",
    requesterId: 11,
    resourceKey: "capitalSecurities.investments",
    documentUids: ["25aec81e-b6e2-41bb-8fbd-3357d661818c"],
  };
  const result = await callBusinessDocumentIntelligence(request);

  assert.equal(result, clientResponse);
  assert.deepEqual(delegatedCalls, [[request]]);
  assert.equal(delegatedCalls[0]?.[0], request);
});
