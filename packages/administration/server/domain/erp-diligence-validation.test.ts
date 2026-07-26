import assert from "node:assert/strict";
import test from "node:test";

import { ErpDiligenceSaveSchema, type ErpDiligenceSaveInput } from "../erp-diligence-schemas";
import { buildErpDiligenceSaveCommand } from "./erp-diligence-validation";

function draft(overrides: Partial<ErpDiligenceSaveInput> = {}): ErpDiligenceSaveInput {
  return {
    positionAssignmentId: 71,
    primaryArea: "sales_ops",
    status: "draft",
    answers: {},
    processSteps: [],
    evidenceItems: [],
    ...overrides,
  };
}

const POSITION_SELECTION = {
  id: 71,
  departmentName: " 销售部 ",
  positionName: " 销售内勤 ",
};

const RESPONSIBILITY_POSITION = {
  positionId: 301,
  positionCode: "SAL001",
  positionName: "销售专员",
  departmentId: 41,
  departmentCode: "SAL",
  departmentName: "销售部",
  scopeDepartmentIds: [41],
};

const VALIDATION_CONTEXT = {
  positionSelection: POSITION_SELECTION,
  responsibilityPositions: [RESPONSIBILITY_POSITION],
};

function processStep(
  overrides: Partial<ErpDiligenceSaveInput["processSteps"][number]> = {},
): ErpDiligenceSaveInput["processSteps"][number] {
  return {
    key: "step-1",
    activityKey: "quotation_process",
    ownerPositionId: 301,
    ownerPositionName: "客户端伪造名称",
    ownerDepartmentName: "客户端伪造部门",
    frequency: "daily",
    volumeBand: "51_200",
    touchTimeBand: "16_30m",
    waitTimeBand: "same_day",
    executionMode: "spreadsheet",
    inputStructure: "documents",
    ruleType: "context_judgment",
    variability: "many",
    exceptionRate: "6_20",
    errorRate: "1_5",
    handoffMode: "chat_email",
    systemCount: "2_3",
    logAvailability: "partial",
    riskLevel: "medium",
    reviewRequirement: "exception",
    painPoints: ["duplicate_entry", "waiting"],
    notes: " 典型例外 ",
    ...overrides,
  };
}

test("ERP diligence draft trims fields and drops undeclared question keys", () => {
  const result = buildErpDiligenceSaveCommand(draft({
    answers: { business_models: " spreadsheet ", unsafe_key: "不应保存" },
    processSteps: [
      processStep({ key: " step-1 " }),
      processStep({ key: "step-empty", activityKey: "" }),
    ],
  }), 7, VALIDATION_CONTEXT);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.departmentName, "销售部");
  assert.deepEqual(result.data.answers, { business_models: "spreadsheet" });
  const steps = result.data.processSteps as unknown as Array<{ ownerPositionName: string; ownerDepartmentName: string; notes: string }>;
  assert.equal(steps.length, 1);
  assert.equal(steps[0]?.ownerPositionName, "销售专员");
  assert.equal(steps[0]?.ownerDepartmentName, "销售部");
  assert.equal(steps[0]?.notes, "典型例外");
});

test("ERP diligence schema allows an incomplete draft but rejects free-text organization identity", () => {
  assert.equal(ErpDiligenceSaveSchema.safeParse(draft({ primaryArea: "" })).success, true);
  assert.equal(ErpDiligenceSaveSchema.safeParse({ ...draft(), departmentName: "伪造部门" }).success, false);
  assert.equal(ErpDiligenceSaveSchema.safeParse({ ...draft(), roleTitle: "伪造岗位" }).success, false);
});

test("ERP diligence save schema accepts controlled multi-select answers", () => {
  const parsed = ErpDiligenceSaveSchema.safeParse(draft({
    answers: { current_reports: ["orders", "collection"] },
  }));

  assert.equal(parsed.success, true);
});

test("ERP diligence submission requires identity, a process step, and structured answers", () => {
  const missingProfile = buildErpDiligenceSaveCommand(draft({ status: "submitted", positionAssignmentId: null }), 7, { positionSelection: null, responsibilityPositions: [] });
  assert.equal(missingProfile.ok, false);
  if (!missingProfile.ok) assert.equal(missingProfile.issue.field, "positionAssignmentId");

  const missingArea = buildErpDiligenceSaveCommand(draft({ status: "submitted", primaryArea: "" }), 7, VALIDATION_CONTEXT);
  assert.equal(missingArea.ok, false);
  if (!missingArea.ok) assert.equal(missingArea.issue.field, "primaryArea");

  const missingProcess = buildErpDiligenceSaveCommand(draft({
    status: "submitted",
    answers: {
      business_models: "spreadsheet",
      company_scope: "isolated_system",
      customer_types: "spreadsheet",
      process_start_end: "messaging",
      lead_sources: "offline",
      customer_master: "isolated_system",
      quotation_process: "spreadsheet",
      pricing_rules: "messaging",
      sales_forecast: "offline",
      contract_order_relation: "unknown",
    },
  }), 7, VALIDATION_CONTEXT);
  assert.equal(missingProcess.ok, false);
  if (!missingProcess.ok) assert.equal(missingProcess.issue.field, "processSteps");
});

test("ERP diligence accepts a minimally complete submission", () => {
  const result = buildErpDiligenceSaveCommand(draft({
    status: "submitted",
    answers: {
      business_models: "spreadsheet",
      company_scope: "isolated_system",
      customer_types: "spreadsheet",
      process_start_end: "messaging",
      lead_sources: "offline",
      customer_master: "isolated_system",
      quotation_process: "spreadsheet",
      pricing_rules: "messaging",
      sales_forecast: "offline",
      contract_order_relation: "unknown",
    },
    processSteps: [processStep()],
  }), 7, VALIDATION_CONTEXT);

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.status, "submitted");
});

test("ERP diligence snapshots department and role from the validated current assignment", () => {
  const result = buildErpDiligenceSaveCommand(draft(), 7, VALIDATION_CONTEXT);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.positionAssignmentId, 71);
  assert.equal(result.data.departmentName, "销售部");
  assert.equal(result.data.roleTitle, "销售内勤");
});

test("ERP diligence rejects a position assignment outside the current user's active positions", () => {
  const result = buildErpDiligenceSaveCommand(draft({ positionAssignmentId: 72 }), 7, VALIDATION_CONTEXT);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.field, "positionAssignmentId");
});

test("ERP diligence rejects responsibility positions outside the respondent department subtree", () => {
  const result = buildErpDiligenceSaveCommand(draft({
    processSteps: [processStep({ ownerPositionId: 999 })],
  }), 7, VALIDATION_CONTEXT);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.field, "processSteps.ownerPositionId");
});

test("ERP diligence rejects unknown structured answer values", () => {
  const result = buildErpDiligenceSaveCommand(draft({
    answers: { business_models: "随便填写的文本" },
  }), 7, VALIDATION_CONTEXT);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.field, "answers.business_models");
});
