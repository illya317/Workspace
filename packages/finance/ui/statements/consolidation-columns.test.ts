import assert from "node:assert/strict";
import test from "node:test";

import type { DataSurfaceCellSpec } from "@workspace/core/ui";
import type {
  ConsolidationEntityCoverage,
  StatementSourceCoverage,
} from "@workspace/finance/types";

import {
  createConsolidationEntityColumns,
  sourceCoverageTone,
} from "./consolidation-columns";

test("uses only ready and not-ready tones for individual statements", () => {
  const source: StatementSourceCoverage = {
    kind: "system",
    status: "available",
    label: "系统账来源",
    detail: "期间事实",
    lineCount: 0,
    sourcedLineCount: 0,
    manualLineCount: 0,
    importedLineCount: 0,
    formulaLineCount: 0,
  };

  assert.equal(sourceCoverageTone(source), "green");
  assert.equal(sourceCoverageTone({ ...source, evidence: "已核对并冻结" }), "green");
  assert.equal(sourceCoverageTone({ ...source, kind: "workpaper", status: "draft" }), "green");
  assert.equal(sourceCoverageTone({ ...source, kind: "workpaper", status: "submitted" }), "green");
  assert.equal(sourceCoverageTone({ ...source, kind: "missing", status: "missing" }), "red");
});

test("keeps ownership context beside the company and exposes a second inclusion column", () => {
  const entity = {
    name: "加拿大",
    fullName: "The Palace Institute of Medical Biology Co Ltd",
    code: "05",
    parentCode: "02",
    parentName: "示例子公司甲",
    role: "子公司",
    shareRatio: 0.75,
    isConsolidated: true,
    relationId: 76,
    relationVersion: 1,
  } as ConsolidationEntityCoverage;
  const changes: Array<[number | null, boolean]> = [];
  const consolidationEntityColumns = createConsolidationEntityColumns({
    canUpdate: true,
    busyRelationId: null,
    onInclusionChange: (row, included) => changes.push([row.relationId, included]),
  });

  assert.deepEqual(consolidationEntityColumns.map((column) => column.key), [
    "company",
    "consolidated",
    "balance",
    "income",
    "cash-flow",
  ]);
  const companyCell = consolidationEntityColumns[0]!.cell(entity) as DataSurfaceCellSpec;
  assert.equal(companyCell.kind, "group");
  assert.match(JSON.stringify(companyCell), /持股 75\.00%/);
  assert.match(JSON.stringify(companyCell), /The Palace Institute of Medical Biology Co Ltd/);
  assert.match(JSON.stringify(companyCell), /示例子公司甲 → 加拿大/);
  assert.doesNotMatch(JSON.stringify(companyCell), /02 → 05/);
  assert.doesNotMatch(JSON.stringify(companyCell), /"wrap":"truncate"/);
  const inclusionCell = consolidationEntityColumns[1]!.cell(entity) as DataSurfaceCellSpec;
  assert.equal(inclusionCell.kind, "action");
  if (inclusionCell.kind !== "action") return;
  assert.equal(inclusionCell.action.label, "本次纳入");
  assert.equal(inclusionCell.action.icon, "check");
  inclusionCell.action.onClick?.();
  assert.deepEqual(changes, [[76, false]]);

  const excludedCell = consolidationEntityColumns[1]!.cell({
    ...entity,
    isConsolidated: false,
  }) as DataSurfaceCellSpec;
  assert.equal(excludedCell.kind, "action");
  if (excludedCell.kind !== "action") return;
  assert.equal(excludedCell.action.label, "本次不纳入");
  assert.equal(excludedCell.action.icon, "x");
});
