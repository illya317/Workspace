import assert from "node:assert/strict";
import test from "node:test";

import {
  buildConsolidatedStatementAssistantContext,
  buildStandaloneStatementAssistantContext,
} from "./statement-assistant-context";

test("standalone statement assistant binds the visible company, period and report", () => {
  const context = buildStandaloneStatementAssistantContext({
    companyCode: "ZX01",
    companyName: "示例集团有限公司",
    year: 2025,
    month: 12,
    reportType: "balance",
  });
  assert.match(context.contextLabel ?? "", /当前页面实时报表，不使用资料库/);
  assert.equal(
    context.sourceContext?.activeChildKey,
    "mode:standalone;company:ZX01;year:2025;month:12;report:balance",
  );
});

test("consolidated statement assistant binds the current consolidation batch", () => {
  const context = buildConsolidatedStatementAssistantContext({
    batchId: 18,
    parentName: "示例集团有限公司",
    year: 2025,
    month: 12,
    reportType: "incomeStatement",
  });
  assert.match(context.contextLabel ?? "", /批次 18/);
  assert.equal(
    context.sourceContext?.activeChildKey,
    "mode:consolidated;batch:18;year:2025;month:12;report:incomeStatement",
  );
});
