import assert from "node:assert/strict";
import test from "node:test";

import { parseLibraryAgentDeliveryRequest } from "./agent-delivery";

const selection = [{
  documentUid: "667a0c90-b94a-483d-8997-c620c3af812a",
  versionUid: "d7d30ff3-d385-4d28-ad29-cf698e9e325a",
}];

function resultData(canExport = true, includeBundle = true) {
  return {
    canExport,
    presentation: {
      kind: "resource-set",
      items: [{ key: selection[0].versionUid }],
      bundle: includeBundle ? {
        requestBody: { selection, includePreviews: false },
      } : undefined,
    },
  };
}

test("delivery parsing accepts an explicit package/send request with immutable versions", () => {
  assert.deepEqual(parseLibraryAgentDeliveryRequest("把这些资料打包发给我", resultData()), {
    status: "ready",
    selection,
    includePreviews: false,
  });
});

test("delivery parsing does not create exports for ordinary search results", () => {
  assert.deepEqual(parseLibraryAgentDeliveryRequest("有哪些财务资料？", resultData()), { status: "none" });
  assert.deepEqual(parseLibraryAgentDeliveryRequest("只列出来，不要打包发给我", resultData()), { status: "none" });
});

test("delivery parsing reports an explicit export denial", () => {
  assert.deepEqual(parseLibraryAgentDeliveryRequest("资料包发给我", resultData(false, false)), { status: "denied" });
});
