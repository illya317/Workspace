import assert from "node:assert/strict";
import test from "node:test";
import { applyHistoricalCutoverEvidencePolicy } from "./historical-cutover-evidence-policy";

function inspection(status: "pending" | "ready" | "blocked" | "unavailable", blockerCode = "real_blocker") {
  return {
    status,
    contributorVersion: "provider-v1",
    inputFingerprint: "before",
    blockers: status === "blocked" || status === "unavailable" ? [{ code: blockerCode, message: "真实阻断", deepLink: "/finance" }] : [],
    evidenceRefs: [],
    voucherRefs: [],
    deepLink: "/finance",
    payload: { original: true },
  };
}

test("June source-closed ledger evidence completes pending evidence-only checks without hiding blockers", () => {
  const result = applyHistoricalCutoverEvidencePolicy(new Map([
    ["pending", inspection("pending")],
    ["blocked", inspection("blocked")],
  ]), {
    enabled: true,
    periodRef: "finance-period:1273",
    voucherRefs: ["finance-voucher:2", "finance-voucher:1"],
  });

  assert.equal(result.get("pending")?.status, "ready");
  assert.deepEqual(result.get("pending")?.evidenceRefs, ["finance-period:1273"]);
  assert.deepEqual(result.get("pending")?.voucherRefs, ["finance-voucher:1", "finance-voucher:2"]);
  assert.notEqual(result.get("pending")?.inputFingerprint, "before");
  assert.equal(result.get("blocked")?.status, "blocked");
  assert.equal(result.get("blocked")?.blockers[0]?.code, "real_blocker");
});

test("June source-closed ledger evidence completes only the allowlisted historical output gaps", () => {
  const result = applyHistoricalCutoverEvidencePolicy(new Map([
    ["finance.statements.standalone", inspection("unavailable", "provider_unavailable")],
    ["finance.statements.group-adjustments", inspection("blocked", "consolidation_not_locked")],
    ["finance.assets.movement", inspection("blocked", "real_blocker")],
  ]), {
    enabled: true,
    periodRef: "finance-period:1273",
    voucherRefs: ["finance-voucher:1"],
  });

  assert.equal(result.get("finance.statements.standalone")?.status, "ready");
  assert.equal(result.get("finance.statements.group-adjustments")?.status, "ready");
  assert.equal(result.get("finance.assets.movement")?.status, "blocked");
  assert.deepEqual(
    (result.get("finance.statements.standalone")?.payload as { historicalCutoverEvidencePolicy: { supersededBlockers: unknown[] } })
      .historicalCutoverEvidencePolicy.supersededBlockers,
    [{ code: "provider_unavailable", message: "真实阻断", deepLink: "/finance" }],
  );
});

test("policy stays inert when the period is not an enabled historical cutover", () => {
  const original = new Map([["pending", inspection("pending")]]);
  assert.equal(applyHistoricalCutoverEvidencePolicy(original, {
    enabled: false,
    periodRef: "finance-period:1",
    voucherRefs: [],
  }), original);
});
