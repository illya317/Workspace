import assert from "node:assert/strict";
import test from "node:test";

import { createHmacMutationImpactTokenCodec } from "../../packages/platform/server/mutation-impact";

const claims = {
  version: 1 as const,
  actorKey: "user:7",
  scopeKey: "personal:7",
  root: { entity: "WorkPlan", id: "9", intent: "archive" as const },
  fingerprint: "fingerprint",
  policyRevision: "work-impact-v1",
  allowedResolutions: [{ relationKey: "work.plan.items", resolutions: ["cascade" as const] }],
  expiresAt: "2026-07-17T12:00:00.000Z",
};

test("mutation impact token is authenticated and round trips claims", async () => {
  const codec = createHmacMutationImpactTokenCodec("test-impact-secret");
  const token = await codec.seal(claims);
  assert.deepEqual(await codec.open(token), claims);
});

test("mutation impact token rejects tampering", async () => {
  const codec = createHmacMutationImpactTokenCodec("test-impact-secret");
  const token = await codec.seal(claims);
  const [version, payload, signature] = token.split(".");
  const tamperedPayload = `${payload?.slice(0, -1)}${payload?.endsWith("A") ? "B" : "A"}`;

  assert.throws(() => codec.open(`${version}.${tamperedPayload}.${signature}`), /invalid mutation impact token signature/);
});
