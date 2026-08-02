import assert from "node:assert/strict";
import test from "node:test";

import {
  applyProjectNotificationAuditResponse,
  flatProjectNotificationCondition,
  normalizeProjectNotificationRedriveReason,
  projectNotificationOperators,
  updateProjectNotificationPredicate,
} from "./notification-governance-model";

test("a slower audit response cannot replace the newly selected rule ledger", async () => {
  let selectedId = 11;
  let resolveA!: (value: string) => void;
  let resolveB!: (value: string) => void;
  const requestA = new Promise<string>((resolve) => {
    resolveA = resolve;
  });
  const requestB = new Promise<string>((resolve) => {
    resolveB = resolve;
  });
  const applied: string[] = [];
  const loadA = applyProjectNotificationAuditResponse(
    requestA,
    () => selectedId === 11,
    (value) => applied.push(value),
  );
  selectedId = 12;
  const loadB = applyProjectNotificationAuditResponse(
    requestB,
    () => selectedId === 12,
    (value) => applied.push(value),
  );

  resolveB("rule-b");
  await loadB;
  resolveA("rule-a");
  await loadA;
  assert.deepEqual(applied, ["rule-b"]);
});

test("flat condition editor accepts only one-level all/any groups", () => {
  assert.deepEqual(flatProjectNotificationCondition({
    op: "all",
    conditions: [{ op: "eq", path: "project.status", value: "active" }],
  })?.logic, "all");
  assert.equal(flatProjectNotificationCondition({
    op: "not",
    condition: { op: "eq", path: "project.status", value: "active" },
  }), null);
});

test("predicate updates coerce bounded editor values to typed DSL values", () => {
  const source = { op: "eq", path: "project.completionPercent", value: 0 } as const;
  assert.deepEqual(updateProjectNotificationPredicate(source, { rawValue: "72.5" }), {
    op: "eq",
    path: "project.completionPercent",
    value: 72.5,
  });
  assert.deepEqual(updateProjectNotificationPredicate(source, { op: "in", rawValue: "10, 20" }), {
    op: "in",
    path: "project.completionPercent",
    value: [10, 20],
  });
});

test("date paths expose relative monitoring operators", () => {
  assert.deepEqual(
    projectNotificationOperators("project.plannedEndDate").slice(-2).map((item) => item.value),
    ["withinNextDays", "daysOverdue"],
  );
});

test("redrive reason is trimmed and bounded for the audited command", () => {
  assert.equal(normalizeProjectNotificationRedriveReason("  修复企业微信绑定后重试  "), "修复企业微信绑定后重试");
  assert.equal(normalizeProjectNotificationRedriveReason("   "), null);
  assert.equal(normalizeProjectNotificationRedriveReason("x".repeat(501)), null);
});

test("switching predicate paths resets incompatible operators and values", () => {
  assert.deepEqual(updateProjectNotificationPredicate({
    op: "gt",
    path: "project.completionPercent",
    value: 80,
  }, {
    path: "project.status",
  }), {
    op: "eq",
    path: "project.status",
    value: "",
  });
});
