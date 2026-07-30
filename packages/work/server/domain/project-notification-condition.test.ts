import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalJson,
  evaluateProjectNotificationCondition,
  prepareProjectNotificationCondition,
  projectNotificationConditionSchema,
  projectNotificationFactsFingerprint,
  type ProjectNotificationCondition,
  type ProjectNotificationSnapshot,
} from "./project-notification-condition";

const snapshot: ProjectNotificationSnapshot = {
  project: {
    status: "active",
    projectLevel: "重点",
    completionPercent: 65,
    plannedStartDate: "2026-08-02",
    plannedEndDate: "2026-08-10",
    riskPresent: true,
    isArchived: false,
  },
  signal: {
    kind: "project.scheduled",
    changedField: "scheduled",
  },
};

function evaluate(condition: ProjectNotificationCondition) {
  return evaluateProjectNotificationCondition({
    condition,
    snapshot,
    businessDate: "2026-08-01",
  });
}

test("accepts the exact snapshot allowlist and rejects arbitrary paths", () => {
  assert.equal(projectNotificationConditionSchema.safeParse({
    op: "eq",
    path: "project.status",
    value: "active",
  }).success, true);
  assert.equal(projectNotificationConditionSchema.safeParse({
    op: "eq",
    path: "project.name",
    value: "secret",
  }).success, false);
});

test("strict schemas reject regex, source code, SQL, and extra properties", () => {
  for (const condition of [
    { op: "regex", path: "project.status", value: ".*" },
    { op: "eq", path: "project.status", value: "active", js: "return true" },
    { op: "eq", path: "project.status", value: "active", sql: "1=1" },
  ]) {
    assert.equal(projectNotificationConditionSchema.safeParse(condition).success, false);
  }
});

test("enforces depth, predicate count, set size, text, and serialized bounds", () => {
  const depthFive = {
    op: "not",
    condition: {
      op: "not",
      condition: {
        op: "not",
        condition: {
          op: "not",
          condition: { op: "present", path: "project.status" },
        },
      },
    },
  };
  assert.equal(projectNotificationConditionSchema.safeParse(depthFive).success, false);

  const predicate = { op: "present", path: "project.status" };
  assert.equal(projectNotificationConditionSchema.safeParse({
    op: "all",
    conditions: Array.from({ length: 33 }, () => predicate),
  }).success, false);
  assert.equal(projectNotificationConditionSchema.safeParse({
    op: "in",
    path: "project.status",
    value: Array.from({ length: 21 }, (_, index) => String(index)),
  }).success, false);
  assert.equal(projectNotificationConditionSchema.safeParse({
    op: "eq",
    path: "project.status",
    value: "x".repeat(201),
  }).success, false);
});

test("enforces path-specific value types and date-only operations", () => {
  assert.equal(projectNotificationConditionSchema.safeParse({
    op: "eq",
    path: "project.completionPercent",
    value: "65",
  }).success, false);
  assert.equal(projectNotificationConditionSchema.safeParse({
    op: "gt",
    path: "project.status",
    value: "pending",
  }).success, false);
  assert.equal(projectNotificationConditionSchema.safeParse({
    op: "withinNextDays",
    path: "project.status",
    value: 7,
  }).success, false);
  assert.equal(projectNotificationConditionSchema.safeParse({
    op: "eq",
    path: "project.plannedEndDate",
    value: "2026-02-30",
  }).success, false);
});

test("evaluates all, any, and not", () => {
  assert.equal(evaluate({
    op: "all",
    conditions: [
      { op: "eq", path: "project.status", value: "active" },
      {
        op: "any",
        conditions: [
          { op: "eq", path: "project.projectLevel", value: "普通" },
          { op: "not", condition: { op: "eq", path: "project.isArchived", value: true } },
        ],
      },
    ],
  }), true);
});

test("evaluates scalar, set, and presence predicates", () => {
  assert.equal(evaluate({ op: "eq", path: "project.riskPresent", value: true }), true);
  assert.equal(evaluate({ op: "neq", path: "project.status", value: "closed" }), true);
  assert.equal(evaluate({ op: "in", path: "project.projectLevel", value: ["重点", "普通"] }), true);
  assert.equal(evaluate({ op: "notIn", path: "signal.kind", value: ["project.updated"] }), true);
  assert.equal(evaluate({ op: "present", path: "project.plannedEndDate" }), true);
  assert.equal(evaluate({ op: "present", path: "project.completionPercent" }), true);
});

test("evaluates numeric and date comparisons", () => {
  assert.equal(evaluate({ op: "gt", path: "project.completionPercent", value: 60 }), true);
  assert.equal(evaluate({ op: "gte", path: "project.completionPercent", value: 65 }), true);
  assert.equal(evaluate({ op: "lt", path: "project.completionPercent", value: 70 }), true);
  assert.equal(evaluate({ op: "lte", path: "project.plannedEndDate", value: "2026-08-10" }), true);
});

test("evaluates withinNextDays and daysOverdue against the supplied business date", () => {
  assert.equal(evaluate({ op: "withinNextDays", path: "project.plannedStartDate", value: 1 }), true);
  assert.equal(evaluate({ op: "withinNextDays", path: "project.plannedEndDate", value: 8 }), false);
  assert.equal(evaluateProjectNotificationCondition({
    condition: { op: "daysOverdue", path: "project.plannedEndDate", value: 2 },
    snapshot,
    businessDate: "2026-08-12",
  }), true);
  assert.equal(evaluateProjectNotificationCondition({
    condition: { op: "daysOverdue", path: "project.plannedEndDate", value: 3 },
    snapshot,
    businessDate: "2026-08-12",
  }), false);
});

test("canonical JSON and fingerprints do not depend on object insertion order", () => {
  const left = { op: "eq", path: "project.status", value: "active" };
  const right = { value: "active", path: "project.status", op: "eq" };
  assert.equal(canonicalJson(left), canonicalJson(right));
  const preparedLeft = prepareProjectNotificationCondition(left);
  const preparedRight = prepareProjectNotificationCondition(right);
  assert.equal(preparedLeft.ok, true);
  assert.equal(preparedRight.ok, true);
  if (preparedLeft.ok && preparedRight.ok) {
    assert.equal(preparedLeft.data.fingerprint, preparedRight.data.fingerprint);
    assert.equal(preparedLeft.data.fingerprint.length, 64);
  }
});

test("facts fingerprint changes with an allowlisted fact", () => {
  const original = projectNotificationFactsFingerprint(snapshot);
  const changed = projectNotificationFactsFingerprint({
    ...snapshot,
    project: { ...snapshot.project, completionPercent: 66 },
  });
  assert.notEqual(original, changed);
});
