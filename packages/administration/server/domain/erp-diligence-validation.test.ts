import assert from "node:assert/strict";
import test from "node:test";

import { ErpDiligenceSaveSchema, type ErpDiligenceSaveInput } from "../erp-diligence-schemas";
import { buildErpDiligenceSaveCommand } from "./erp-diligence-validation";

function draft(overrides: Partial<ErpDiligenceSaveInput> = {}): ErpDiligenceSaveInput {
  return {
    departmentName: " 销售部 ",
    roleTitle: " 销售内勤 ",
    primaryArea: "sales_ops",
    status: "draft",
    answers: {},
    processSteps: [],
    evidenceItems: [],
    ...overrides,
  };
}

test("ERP diligence draft trims fields and drops undeclared question keys", () => {
  const result = buildErpDiligenceSaveCommand(draft({
    answers: { business_models: " 产品直销 ", unsafe_key: "不应保存" },
    processSteps: [
      { key: " step-1 ", name: " 建立报价 ", trigger: "收到需求", owner: "销售", inputOutput: "报价单", tool: "Excel", handoff: "邮件确认", exceptions: "" },
      { key: "step-empty", name: "", trigger: "", owner: "", inputOutput: "", tool: "", handoff: "", exceptions: "" },
    ],
  }), 7);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.departmentName, "销售部");
  assert.deepEqual(result.data.answers, { business_models: "产品直销" });
  assert.equal((result.data.processSteps as Array<{ name: string }>).length, 1);
});

test("ERP diligence schema allows an incomplete draft but rejects extra identity fields", () => {
  assert.equal(ErpDiligenceSaveSchema.safeParse(draft({ primaryArea: "" })).success, true);
  assert.equal(ErpDiligenceSaveSchema.safeParse({ ...draft(), respondentName: "伪造姓名" }).success, false);
});

test("ERP diligence submission requires identity, a process step, and five answers", () => {
  const missingProfile = buildErpDiligenceSaveCommand(draft({ status: "submitted", departmentName: "" }), 7);
  assert.equal(missingProfile.ok, false);
  if (!missingProfile.ok) assert.equal(missingProfile.issue.field, "departmentName");

  const missingArea = buildErpDiligenceSaveCommand(draft({ status: "submitted", primaryArea: "" }), 7);
  assert.equal(missingArea.ok, false);
  if (!missingArea.ok) assert.equal(missingArea.issue.field, "primaryArea");

  const missingProcess = buildErpDiligenceSaveCommand(draft({
    status: "submitted",
    answers: {
      business_models: "产品",
      company_scope: "单主体",
      customer_types: "企业",
      process_start_end: "报价到回款",
      lead_sources: "转介绍",
    },
  }), 7);
  assert.equal(missingProcess.ok, false);
  if (!missingProcess.ok) assert.equal(missingProcess.issue.field, "processSteps");
});

test("ERP diligence accepts a minimally complete submission", () => {
  const result = buildErpDiligenceSaveCommand(draft({
    status: "submitted",
    answers: {
      business_models: "产品",
      company_scope: "单主体",
      customer_types: "企业",
      process_start_end: "报价到回款",
      lead_sources: "转介绍",
    },
    processSteps: [
      { key: "step-1", name: "建立报价", trigger: "收到需求", owner: "销售", inputOutput: "报价单", tool: "Excel", handoff: "邮件确认", exceptions: "" },
    ],
  }), 7);

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.status, "submitted");
});
