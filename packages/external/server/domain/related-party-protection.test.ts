import assert from "node:assert/strict";
import test from "node:test";

import { resolveRelatedPartyProtection } from "./related-party-protection";

test("protects an internal company related party", () => {
  assert.deepEqual(resolveRelatedPartyProtection({ company: { id: 1 }, ownedInterests: [] }, "2026-07-29"), {
    systemConfigured: true,
    systemConfiguredReason: "内部公司由系统配置维护",
  });
});

test("protects a related party with a current confirmed ownership interest", () => {
  assert.equal(resolveRelatedPartyProtection({
    company: null,
    ownedInterests: [{
      recordStatus: "confirmed",
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      effectiveTo: null,
    }],
  }, "2026-07-29").systemConfigured, true);
});

test("does not protect an expired or pending ownership relationship", () => {
  assert.deepEqual(resolveRelatedPartyProtection({
    company: null,
    ownedInterests: [
      {
        recordStatus: "confirmed",
        effectiveFrom: new Date("2025-01-01T00:00:00.000Z"),
        effectiveTo: new Date("2025-12-31T00:00:00.000Z"),
      },
      { recordStatus: "pending", effectiveFrom: null, effectiveTo: null },
    ],
  }, "2026-07-29"), {
    systemConfigured: false,
    systemConfiguredReason: null,
  });
});
