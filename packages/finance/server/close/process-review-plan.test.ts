import assert from "node:assert/strict";
import test from "node:test";
import type { FinanceCloseRefreshPlanItem } from "./providers";
import { deriveCloseProcessReviewPlan } from "./process-review-plan";

function item(taskKey: string, status: "pending" | "ready" | "blocked" | "unavailable"): FinanceCloseRefreshPlanItem {
  const inspection = { status, contributorVersion: "v1", inputFingerprint: taskKey, blockers: [], evidenceRefs: [], voucherRefs: [], deepLink: "/finance/ledger", payload: { taskKey } };
  return { taskKey, inspection, snapshotPayload: { status, blockers: [], evidenceRefs: [], voucherRefs: [], deepLink: inspection.deepLink, payload: inspection.payload }, payloadSha256: taskKey };
}

test("final process review derives from the same refresh without recursive inspection", () => {
  const blocked = deriveCloseProcessReviewPlan([item("one", "ready"), item("two", "blocked"), item("close-process-review", "ready")]);
  assert.equal(blocked.at(-1)?.inspection.status, "blocked");
  assert.equal(blocked.at(-1)?.inspection.blockers[0]?.code, "close_dependencies_blocked");
  const ready = deriveCloseProcessReviewPlan([item("one", "ready"), item("two", "ready"), item("close-process-review", "ready")]);
  assert.equal(ready.at(-1)?.inspection.status, "ready");
});

test("final process review identity is bound to its own blocker snapshot", () => {
  const review = item("close-process-review", "blocked");
  const withMessage = (message: string) => ({
    ...review,
    inspection: {
      ...review.inspection,
      blockers: [{ code: "review_blocked", message, deepLink: review.inspection.deepLink }],
    },
  });
  const first = deriveCloseProcessReviewPlan([item("one", "ready"), withMessage("first decision")]).at(-1)!;
  const changed = deriveCloseProcessReviewPlan([item("one", "ready"), withMessage("changed decision")]).at(-1)!;

  assert.notEqual(first.inspection.inputFingerprint, changed.inspection.inputFingerprint);
  assert.equal(first.inspection.inputFingerprint, first.payloadSha256);
  assert.equal(changed.inspection.inputFingerprint, changed.payloadSha256);
});
