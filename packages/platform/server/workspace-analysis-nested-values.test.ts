import assert from "node:assert/strict";
import test from "node:test";

import { flattenWorkspaceAnalysisNestedValue } from "./workspace-analysis-nested-values";

test("flattens nested public values into deterministic scalar rows", () => {
  assert.deepEqual(flattenWorkspaceAnalysisNestedValue({
    note: "说明",
    metrics: { count: 2, enabled: true },
    tags: ["甲", "乙"],
    empty: {},
  }), [
    { path: "$.empty", valueKind: "object", textValue: "{}", numberValue: null, booleanValue: null },
    { path: "$.metrics.count", valueKind: "number", textValue: "2", numberValue: 2, booleanValue: null },
    { path: "$.metrics.enabled", valueKind: "boolean", textValue: "true", numberValue: null, booleanValue: true },
    { path: "$.note", valueKind: "text", textValue: "说明", numberValue: null, booleanValue: null },
    { path: "$.tags[0]", valueKind: "text", textValue: "甲", numberValue: null, booleanValue: null },
    { path: "$.tags[1]", valueKind: "text", textValue: "乙", numberValue: null, booleanValue: null },
  ]);
});

test("preserves null and empty arrays and rejects cycles", () => {
  assert.deepEqual(flattenWorkspaceAnalysisNestedValue({ nullable: null, empty: [] }), [
    { path: "$.empty", valueKind: "array", textValue: "[]", numberValue: null, booleanValue: null },
    { path: "$.nullable", valueKind: "null", textValue: null, numberValue: null, booleanValue: null },
  ]);
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.throws(() => flattenWorkspaceAnalysisNestedValue(cyclic), /循环引用/);
});
