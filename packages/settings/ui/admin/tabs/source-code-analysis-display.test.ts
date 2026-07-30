import assert from "node:assert/strict";
import test from "node:test";

import {
  SOURCE_CODE_ANALYSIS_ROLES,
  SOURCE_CODE_ANALYSIS_ROLE_LABELS,
  type SourceCodeAnalysisRoleCounts,
} from "@workspace/platform/source-code-analysis-contract";
import {
  SOURCE_CODE_ANALYSIS_DISPLAY_GROUPS,
  displayGroupLines,
} from "./source-code-analysis-display";

test("display groups cover every governed source role exactly once", () => {
  const groupedRoles = SOURCE_CODE_ANALYSIS_DISPLAY_GROUPS.flatMap((group) => group.roles).sort();
  assert.deepEqual(groupedRoles, [...SOURCE_CODE_ANALYSIS_ROLES].sort());
});

test("collapsed display totals preserve all detailed role lines", () => {
  const roles = Object.fromEntries(
    SOURCE_CODE_ANALYSIS_ROLES.map((role, index) => [role, index + 1]),
  ) as SourceCodeAnalysisRoleCounts;
  const displayedTotal = SOURCE_CODE_ANALYSIS_DISPLAY_GROUPS.reduce(
    (sum, group) => sum + displayGroupLines(roles, group),
    0,
  );
  const detailedTotal = SOURCE_CODE_ANALYSIS_ROLES.reduce((sum, role) => sum + roles[role], 0);
  assert.equal(displayedTotal, detailedTotal);
});

test("frontend merges small roles into other without merging backend roles", () => {
  const other = SOURCE_CODE_ANALYSIS_DISPLAY_GROUPS.find((group) => group.key === "other");
  assert.deepEqual(other?.roles, ["integration", "composition", "test", "tooling"]);
  assert.deepEqual(other?.roles.map((role) => SOURCE_CODE_ANALYSIS_ROLE_LABELS[role]), [
    "外部集成",
    "组合壳",
    "模块测试",
    "工程实现",
  ]);
});
