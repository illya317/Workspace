import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateModuleHealth,
  moduleHealthReviewEvidence,
  moduleHealthReviewStatus,
  parseModuleHealthReviewReceipt,
  parseModuleHealthReviewPolicy,
  type ModuleHealthMetrics,
  type ModuleHealthReviewReceipt,
} from "./module-health-policy";

function metrics(overrides: Partial<ModuleHealthMetrics> = {}): ModuleHealthMetrics {
  return {
    moduleKey: "operations",
    key: "release",
    kind: "module",
    childCount: 0,
    implementationLines: 1_000,
    implementationFileCount: 10,
    outgoingLeafDependencyCount: 2,
    legacyImplementationBypassCount: 0,
    referencedByActiveModuleCount: 0,
    ...overrides,
  };
}

test("health warnings skip pure aggregate parents but include residual parent implementation", () => {
  const warnings = evaluateModuleHealth([
    metrics({
      key: "aggregate-parent",
      childCount: 2,
      implementationLines: 0,
      implementationFileCount: 0,
      outgoingLeafDependencyCount: 0,
    }),
    metrics({
      key: "residual-parent",
      childCount: 2,
      implementationLines: 10_000,
      implementationFileCount: 10,
      outgoingLeafDependencyCount: 2,
    }),
    metrics({
      key: "leaf",
      implementationLines: 10_000,
      implementationFileCount: 80,
      outgoingLeafDependencyCount: 15,
    }),
  ]);
  assert.deepEqual(warnings.map((item) => [item.moduleId, item.code]), [
    ["operations/leaf", "high-leaf-fan-out"],
    ["operations/leaf", "oversized-leaf-files"],
    ["operations/leaf", "oversized-leaf-lines"],
    ["operations/residual-parent", "oversized-leaf-lines"],
  ]);
  assert.ok(warnings.every((item) => item.requiresHygieneReview));
});

test("entry and orchestrator nodes use a smaller implementation budget", () => {
  assert.deepEqual(
    evaluateModuleHealth([
      metrics({
        key: "entry",
        kind: "entry",
        implementationLines: 3_000,
        implementationFileCount: 200,
        outgoingLeafDependencyCount: 30,
      }),
      metrics({
        key: "orchestrator",
        kind: "orchestrator",
        implementationLines: 2_999,
        implementationFileCount: 200,
        outgoingLeafDependencyCount: 30,
      }),
    ]).map((item) => [item.moduleId, item.code]),
    [["operations/entry", "oversized-orchestration"]],
  );
});

test("append-only history is exempt from size while bypass and retired references remain visible", () => {
  assert.deepEqual(
    evaluateModuleHealth([
      metrics({
        key: "history",
        kind: "appendOnlyHistory",
        implementationLines: 100_000,
        implementationFileCount: 1_000,
        outgoingLeafDependencyCount: 20,
      }),
      metrics({ key: "legacy", legacyImplementationBypassCount: 1 }),
      metrics({ key: "retired", kind: "retired", referencedByActiveModuleCount: 2 }),
    ]).map((item) => [item.moduleId, item.code]),
    [
      ["operations/legacy", "legacy-implementation-bypass"],
      ["operations/retired", "retired-module-referenced"],
    ],
  );
});

test("accepted Hygiene review expires on structural change, new warning, growth, or time", () => {
  const currentMetrics = metrics({ implementationLines: 10_000 });
  const warnings = evaluateModuleHealth([currentMetrics]);
  const reviewedEvidence = moduleHealthReviewEvidence(currentMetrics, warnings, {
    interfaceDigest: "interface-1",
    dependencyDigest: "dependency-1",
    debtDigest: "debt-0001",
  });
  const receipt: ModuleHealthReviewReceipt = {
    schemaVersion: 1,
    moduleId: reviewedEvidence.moduleId,
    decision: "accepted",
    reviewer: "hygiene-owner",
    reason: "Cohesion is verified and the split would expose a weaker interface.",
    reviewedAt: "2026-08-01T00:00:00.000Z",
    expiresAt: "2026-08-30T00:00:00.000Z",
    evidence: reviewedEvidence,
  };
  assert.deepEqual(
    moduleHealthReviewStatus(receipt, reviewedEvidence, new Date("2026-08-02T00:00:00.000Z")),
    { valid: true, reason: null },
  );
  assert.equal(moduleHealthReviewStatus(receipt, {
    ...reviewedEvidence,
    implementationLines: 11_001,
  }, new Date("2026-08-02T00:00:00.000Z")).reason, "lines-grew-over-ten-percent");
  assert.equal(moduleHealthReviewStatus(receipt, {
    ...reviewedEvidence,
    interfaceDigest: "interface-2",
  }, new Date("2026-08-02T00:00:00.000Z")).reason, "interface-changed");
  assert.equal(moduleHealthReviewStatus(receipt, {
    ...reviewedEvidence,
    warningCodes: [...reviewedEvidence.warningCodes, "high-leaf-fan-out"],
  }, new Date("2026-08-02T00:00:00.000Z")).reason, "new-warning");
  assert.equal(
    moduleHealthReviewStatus(receipt, reviewedEvidence, new Date("2026-09-01T00:00:00.000Z")).reason,
    "expired",
  );
});

test("review receipts are strict, auditable, and limited to 90 days", () => {
  const valid = {
    schemaVersion: 1,
    moduleId: "operations/release",
    decision: "accepted",
    reviewer: "hygiene-owner",
    reason: "The current responsibility remains cohesive.",
    reviewedAt: "2026-08-01T00:00:00.000Z",
    expiresAt: "2026-10-30T00:00:00.000Z",
    evidence: {
      moduleId: "operations/release",
      warningCodes: ["oversized-leaf-lines"],
      implementationLines: 10_000,
      implementationFileCount: 40,
      outgoingLeafDependencyCount: 3,
      legacyImplementationBypassCount: 0,
      referencedByActiveModuleCount: 0,
      interfaceDigest: "interface-1",
      dependencyDigest: "dependency-1",
      debtDigest: "debt-0001",
    },
  };
  assert.equal(parseModuleHealthReviewReceipt(valid).decision, "accepted");
  assert.throws(
    () => parseModuleHealthReviewReceipt({
      ...valid,
      expiresAt: "2026-10-31T00:00:00.000Z",
    }),
    /within 90 days/,
  );
  assert.throws(
    () => parseModuleHealthReviewReceipt({
      ...valid,
      evidence: { ...valid.evidence, warningCodes: ["oversized-leaf-lines", "high-leaf-fan-out"] },
    }),
    /invalid module health review evidence/,
  );
  assert.deepEqual(parseModuleHealthReviewPolicy({ schemaVersion: 1, reviews: [] }), {
    schemaVersion: 1,
    reviews: [],
  });
  assert.throws(
    () => parseModuleHealthReviewPolicy({ schemaVersion: 1, reviews: [valid, valid] }),
    /duplicate module health review/,
  );
});
