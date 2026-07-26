import assert from "node:assert/strict";
import test from "node:test";

import { calculateErpDiligenceOpportunity } from "./erp-diligence-definition";

test("structured high-volume rules work is ranked for deterministic automation", () => {
  const score = calculateErpDiligenceOpportunity({
    frequency: "daily_many",
    volumeBand: "gt_1000",
    touchTimeBand: "16_30m",
    waitTimeBand: "same_day",
    executionMode: "multi_system_manual",
    inputStructure: "structured_digital",
    ruleType: "fixed",
    variability: "single",
    exceptionRate: "lt_1",
    errorRate: "6_20",
    handoffMode: "export_import",
    systemCount: "4_plus",
    logAvailability: "complete",
    riskLevel: "medium",
    reviewRequirement: "exception",
    painPoints: ["duplicate_entry", "cross_system", "manual_reconciliation"],
  });
  assert.equal(score.digitizationScore >= 65, true);
  assert.equal(score.recommendation, "deterministic_automation");
});

test("document-heavy contextual work is ranked for agent assistance with review", () => {
  const score = calculateErpDiligenceOpportunity({
    frequency: "daily",
    volumeBand: "51_200",
    touchTimeBand: "31_60m",
    waitTimeBand: "1_3d",
    executionMode: "chat_email",
    inputStructure: "documents",
    ruleType: "context_judgment",
    variability: "many",
    exceptionRate: "6_20",
    errorRate: "1_5",
    handoffMode: "chat_email",
    systemCount: "2_3",
    logAvailability: "partial",
    riskLevel: "high",
    reviewRequirement: "every_case",
    painPoints: ["document_reading", "communication", "exceptions"],
  });
  assert.equal(score.agentScore >= 60, true);
  assert.equal(score.recommendation, "agent_with_review");
});
