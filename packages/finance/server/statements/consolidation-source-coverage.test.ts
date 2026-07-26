import assert from "node:assert/strict";
import test from "node:test";

import {
  consolidationEntitySourceStatus,
  consolidationSourcesReady,
  frozenSourceCoverage,
  liveSourceCoverage,
} from "./consolidation-source-coverage";

test("individual statements expose only ready and not-ready labels", () => {
  assert.equal(liveSourceCoverage({ ready: true, count: 3, label: "内部来源", detail: "完整" }).label, "已就绪");
  assert.equal(liveSourceCoverage({ ready: false, count: 0, label: "内部原因", detail: "缺少事实" }).label, "未就绪");
  assert.equal(frozenSourceCoverage({
    id: 1,
    sourceKind: "system",
    sourceStatus: "available",
    workpaperId: null,
    workpaperVersion: null,
    lineCount: 3,
    sourcedLineCount: 3,
    manualLineCount: 0,
    importedLineCount: 0,
    formulaLineCount: 0,
    fingerprint: "ready",
    evidence: null,
  }).label, "已就绪");
  assert.equal(frozenSourceCoverage({
    id: 2,
    sourceKind: "missing",
    sourceStatus: "missing",
    workpaperId: null,
    workpaperVersion: null,
    lineCount: 0,
    sourcedLineCount: 0,
    manualLineCount: 0,
    importedLineCount: 0,
    formulaLineCount: 0,
    fingerprint: "missing",
    evidence: "系统自动快照",
  }).label, "未就绪");
});

test("ready system snapshots do not require a manual acceptance comment", () => {
  const source = frozenSourceCoverage({
    id: 1,
    sourceKind: "system",
    sourceStatus: "available",
    workpaperId: null,
    workpaperVersion: null,
    lineCount: 3,
    sourcedLineCount: 3,
    manualLineCount: 0,
    importedLineCount: 0,
    formulaLineCount: 0,
    fingerprint: "ready",
    evidence: null,
  });
  assert.equal(consolidationEntitySourceStatus({
    role: "母公司",
    shareRatio: 1,
    balanceSheet: source,
    incomeStatement: source,
    cashFlow: source,
  }), "ready");
});

test("starting eliminations requires all three statements for every entity", () => {
  assert.equal(consolidationSourcesReady(2, Array.from({ length: 6 }, () => ({ sourceKind: "system" }))), true);
  assert.equal(consolidationSourcesReady(2, Array.from({ length: 5 }, () => ({ sourceKind: "system" }))), false);
  assert.equal(consolidationSourcesReady(2, [
    ...Array.from({ length: 5 }, () => ({ sourceKind: "system" })),
    { sourceKind: "missing" },
  ]), false);
});
