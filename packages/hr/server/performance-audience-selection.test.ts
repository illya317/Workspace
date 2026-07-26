import assert from "node:assert/strict";
import test from "node:test";
import { resolveHrPerformanceDashboardProjection } from "./performance-audience-selection";

test("performance dashboard defaults to the current employee projection", () => {
  const projection = resolveHrPerformanceDashboardProjection({
    requestedView: null,
    canReadSummary: false,
    currentEmployeeId: 17,
    requestedAudienceType: null,
    requestedAudienceId: null,
  });

  assert.equal(projection.ok, true);
  if (!projection.ok) return;
  assert.equal(projection.view, "self");
  assert.equal(projection.audienceType, "personal");
  assert.equal(projection.audienceId, 17);
  assert.deepEqual([...projection.employeeIds ?? []], [17]);
});

test("performance self projection rejects another employee or organization audience", () => {
  for (const request of [
    { requestedAudienceType: "personal" as const, requestedAudienceId: 18 },
    { requestedAudienceType: "department" as const, requestedAudienceId: 3 },
    { requestedAudienceType: "project" as const, requestedAudienceId: 9 },
  ]) {
    assert.deepEqual(resolveHrPerformanceDashboardProjection({
      requestedView: "self",
      canReadSummary: false,
      currentEmployeeId: 17,
      ...request,
    }), { ok: false, reason: "self_scope_forbidden" });
  }
});

test("performance summary projection requires independent summary access", () => {
  assert.deepEqual(resolveHrPerformanceDashboardProjection({
    requestedView: "summary",
    canReadSummary: false,
    currentEmployeeId: 17,
    requestedAudienceType: null,
    requestedAudienceId: null,
  }), { ok: false, reason: "summary_forbidden" });

  const allowed = resolveHrPerformanceDashboardProjection({
    requestedView: "summary",
    canReadSummary: true,
    currentEmployeeId: 17,
    requestedAudienceType: "department",
    requestedAudienceId: 3,
  });
  assert.equal(allowed.ok, true);
  if (!allowed.ok) return;
  assert.equal(allowed.view, "summary");
  assert.equal(allowed.audienceType, "department");
  assert.equal(allowed.audienceId, 3);
  assert.equal(allowed.employeeIds, null);
});
