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

test("display groups follow the default dependency direction without merging backend roles", () => {
  assert.deepEqual(SOURCE_CODE_ANALYSIS_DISPLAY_GROUPS.map((group) => group.key), [
    "entry",
    "application",
    "adapter",
    "domain",
    "contract",
    "assurance",
  ]);
  const entry = SOURCE_CODE_ANALYSIS_DISPLAY_GROUPS.find((group) => group.key === "entry");
  assert.deepEqual(entry?.roles.map((role) => SOURCE_CODE_ANALYSIS_ROLE_LABELS[role]), [
    "组合壳",
    "公共出口",
    "UI",
    "输入",
  ]);
  const assurance = SOURCE_CODE_ANALYSIS_DISPLAY_GROUPS.find((group) => group.key === "assurance");
  assert.deepEqual(assurance?.roles.map((role) => SOURCE_CODE_ANALYSIS_ROLE_LABELS[role]), [
    "模块测试",
    "工程实现",
  ]);
});
