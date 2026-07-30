import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInvestmentDocumentUploadCommand,
  buildInvestmentEnterpriseCreateCommand,
  buildInvestmentEnterpriseRecordCommand,
} from "./investment-enterprise-validation";

test("investment enterprise profile normalizes the maintained portfolio fields", async () => {
  const result = await buildInvestmentEnterpriseCreateCommand({
    companyId: 7,
    portfolioCode: " PE-2026-001 ",
    investmentStatus: "active",
    investmentDate: "2026-07-30",
    investedAmount: "12000000",
    currentValuation: 18000000,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.companyId, 7);
  assert.equal(result.data.data.portfolioCode, "PE-2026-001");
  assert.equal(result.data.data.investedAmount, "12000000.00");
  assert.equal(result.data.data.investmentDate?.toISOString().slice(0, 10), "2026-07-30");
});

test("investment enterprise records reject impossible dates and unregistered enum values", () => {
  const impossibleDate = buildInvestmentEnterpriseRecordCommand({
    kind: "monitoring",
    profileId: 2,
    periodEnd: "2026-02-31",
  });
  assert.equal(impossibleDate.ok, false);

  const unregisteredRisk = buildInvestmentEnterpriseRecordCommand({
    kind: "diligence",
    profileId: 2,
    title: "税务风险",
    workstream: "tax",
    riskLevel: "urgent",
  });
  assert.equal(unregisteredRisk.ok, false);
});

test("investment enterprise contract preserves source counterparty text", () => {
  const result = buildInvestmentEnterpriseRecordCommand({
    kind: "contract",
    profileId: 2,
    title: "A 轮投资协议",
    contractType: "investment_agreement",
    counterpartyText: "协议原文中的甲方、乙方及保证方",
    status: "effective",
  });

  assert.equal(result.ok, true);
  if (!result.ok || result.data.kind !== "contract") return;
  assert.equal(result.data.data.counterpartyText, "协议原文中的甲方、乙方及保证方");
});

test("investment enterprise upload accepts analyzable documents and rejects executables", async () => {
  const valid = await buildInvestmentDocumentUploadCommand({
    profileId: 2,
    documentCategory: "due_diligence",
    title: "法务尽调报告",
    notes: null,
    file: new File(["fixture"], "legal-dd.pdf", { type: "application/pdf" }),
  });
  assert.equal(valid.ok, true);

  const invalid = await buildInvestmentDocumentUploadCommand({
    profileId: 2,
    documentCategory: "other",
    title: "不可分析文件",
    notes: null,
    file: new File(["fixture"], "payload.exe", { type: "application/octet-stream" }),
  });
  assert.equal(invalid.ok, false);
});
