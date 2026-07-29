import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateLifecycleReconciliation,
  LIFECYCLE_RECONCILIATION_CHECKS,
} from "./business-lifecycle-reconciliation";

test("lifecycle reconciliation queries are read-only count checks", () => {
  assert.ok(LIFECYCLE_RECONCILIATION_CHECKS.length >= 15);
  assert.equal(new Set(LIFECYCLE_RECONCILIATION_CHECKS.map((check) => check.id)).size, LIFECYCLE_RECONCILIATION_CHECKS.length);
  for (const check of LIFECYCLE_RECONCILIATION_CHECKS) {
    assert.match(check.sql.trim(), /^(SELECT|WITH)\b/i);
    assert.doesNotMatch(check.sql, /\b(INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE)\b/i);
  }
});

test("lifecycle reconciliation covers every mutable organization and contract projection field", () => {
  const checks = new Map(LIFECYCLE_RECONCILIATION_CHECKS.map((check) => [check.id, check.sql]));
  for (const [id, fields] of [
    ["organization.department_payload", ["code", "name", "alias", "hierarchyKind", "level", "parentId", "managerPositionId"]],
    ["organization.position_payload", ["code", "name", "alias", "departmentId", "reportToPositionId"]],
    ["organization.report_override_payload", ["departmentId", "reportToPositionId", "headcount", "remark"]],
  ] as const) {
    const sql = checks.get(id);
    assert.ok(sql, `${id} must be registered`);
    for (const field of fields) assert.match(sql, new RegExp(`"${field}"`));
  }
  const contractSql = checks.get("contract.current_snapshot");
  assert.ok(contractSql);
  assert.match(contractSql, /shareholder/);
  assert.match(contractSql, /content/);
  assert.match(contractSql, /signedOnPrecision/);
  assert.match(contractSql, /expiresOnPrecision/);
  assert.match(contractSql, /legacySignDateRaw/);
  assert.match(contractSql, /legacyEndDateRaw/);
  assert.match(contractSql, /snapshotSchemaVersion/);
});

test("lifecycle reconciliation fails closed on any nonzero violation count", () => {
  const base = {
    asOfDate: "2026-07-29",
    scanned: { contracts: 1 },
    checks: [{ id: "contract.current_revision", description: "current revision", violations: 0 }],
  };
  assert.equal(evaluateLifecycleReconciliation(base).ok, true);
  assert.equal(evaluateLifecycleReconciliation({
    ...base,
    checks: [{ ...base.checks[0]!, violations: 1 }],
  }).ok, false);
});
