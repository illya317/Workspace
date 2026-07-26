import assert from "node:assert/strict";
import test from "node:test";

import { createWorkspaceAnalysisSourceCatalog } from "@workspace/platform/server/workspace-analysis-source-registry";

import {
  FINANCE_COST_ANALYSIS_SOURCE,
  FINANCE_COST_SALES_SALARY_SOURCE,
  FINANCE_COST_SHIPMENTS_ANALYSIS_SOURCE,
  FINANCE_COST_STRUCTURE_SOURCE,
  FINANCE_COST_WORKSHOP_REPORTS_SOURCE,
  FINANCE_SHIPMENTS_ANALYSIS_SOURCE,
  FINANCE_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS,
} from "./workspace-analysis-sources";

const SHIPMENT_DTO_FIELDS = [
  "id",
  "importId",
  "customerId",
  "productId",
  "employeeId",
  "salesChannel",
  "salespersonName",
  "salespersonStatus",
  "customerMasterStatus",
  "productMasterStatus",
  "year",
  "month",
  "date",
  "customerName",
  "employeeName",
  "productName",
  "spec",
  "batchNo",
  "quantity",
  "unitPrice",
  "amount",
  "receivedAmount",
  "unreceivedAmount",
  "sourceFile",
  "sourceSheet",
  "sourceRow",
  "createdAt",
  "updatedAt",
].sort();

test("registers the personal shipment source and five finance.cost workspace read models", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog(FINANCE_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS);

  assert.deepEqual(catalog.list().map((source) => source.sourceKey), [
    "finance.cost.analysis",
    "finance.cost.sales-salary",
    "finance.cost.shipments",
    "finance.cost.structure",
    "finance.cost.workshop-reports",
    "finance.shipments",
  ]);
  assert.deepEqual(FINANCE_SHIPMENTS_ANALYSIS_SOURCE.definition.authorization, {
    resourceKey: "finance.operationalAnalytics",
    requiredActions: ["read"],
    projection: "default",
    enforcement: "serviceDelegated",
  });
  assert.equal(FINANCE_SHIPMENTS_ANALYSIS_SOURCE.definition.scopeBindings.personal?.mode, "target");
  assert.equal(FINANCE_SHIPMENTS_ANALYSIS_SOURCE.definition.scopeBindings.department, undefined);
  assert.equal(FINANCE_SHIPMENTS_ANALYSIS_SOURCE.definition.scopeBindings.project, undefined);
});

test("workspace read models inherit finance.cost.read and explicitly remain company-wide in every space", () => {
  for (const registration of [
    FINANCE_COST_SHIPMENTS_ANALYSIS_SOURCE,
    FINANCE_COST_ANALYSIS_SOURCE,
    FINANCE_COST_STRUCTURE_SOURCE,
    FINANCE_COST_SALES_SALARY_SOURCE,
    FINANCE_COST_WORKSHOP_REPORTS_SOURCE,
  ]) {
    assert.deepEqual(registration.definition.authorization, {
      resourceKey: "finance.cost",
      requiredActions: ["read"],
      projection: "default",
      enforcement: "gateway",
    });
    assert.deepEqual(
      Object.fromEntries(Object.entries(registration.definition.scopeBindings).map(([key, value]) => [key, value?.mode])),
      { personal: "workspace", department: "workspace", project: "workspace" },
    );
    assert.deepEqual(registration.adapter.scopeQuery, {});
  }
});

test("shipment read models account for every public ShipmentDTO field and only omit the invalid derived value", () => {
  for (const registration of [FINANCE_SHIPMENTS_ANALYSIS_SOURCE, FINANCE_COST_SHIPMENTS_ANALYSIS_SOURCE]) {
    assert.deepEqual(
      registration.fieldCoverage?.map((item) => item.fieldKey).sort(),
      SHIPMENT_DTO_FIELDS,
    );
    assert.deepEqual(
      registration.fieldCoverage?.filter((item) => item.disposition !== "analytical"),
      [{
        fieldKey: "unreceivedAmount",
        disposition: "omit",
        reason: "unstable",
        description: "当前 DTO 会把未知回款当作零计算未回款，口径修正前不得用于分析。",
      }],
    );
    assert.equal(registration.definition.fields.some((field) => field.key === "sourceFile"), true);
    assert.equal(registration.definition.fields.some((field) => field.key === "salespersonStatus"), true);
    assert.equal(registration.definition.fields.some((field) => field.key === "unreceivedAmount"), false);
  }
});

test("restricted salary labels remain queryable while preserving export metadata", () => {
  const actualSalary = FINANCE_COST_SALES_SALARY_SOURCE.definition.fields.find((field) => field.key === "actualSalary");
  const employeeName = FINANCE_COST_SALES_SALARY_SOURCE.definition.fields.find((field) => field.key === "employeeName");

  assert.equal(actualSalary?.sensitivity, "restricted");
  assert.equal(actualSalary?.exportPolicy, "forbidden");
  assert.equal(actualSalary?.capabilities.displayable, true);
  assert.equal(employeeName?.sensitivity, "restricted");
  assert.equal(employeeName?.capabilities.displayable, true);
});

test("cost structure accounts for nested DTO objects without exposing unstable JSON", () => {
  assert.deepEqual(
    FINANCE_COST_STRUCTURE_SOURCE.fieldCoverage?.filter((item) => item.disposition !== "analytical"),
    [
      {
        fieldKey: "product",
        disposition: "omit",
        reason: "derivedDuplicate",
        description: "公开 DTO 的产品对象已等价展开为 productId、productMasterCode 与 productMasterName。",
      },
      {
        fieldKey: "receiptReport",
        disposition: "omit",
        reason: "nonScalar",
        description: "公开 DTO 的入库报单是嵌套对象；本源保留 receiptReportId 与关联状态，报单字段应由入库读模型承载。",
      },
    ],
  );
  assert.equal(FINANCE_COST_STRUCTURE_SOURCE.definition.fields.some((field) => field.key === "productMasterCode"), true);
  assert.equal(FINANCE_COST_STRUCTURE_SOURCE.definition.fields.some((field) => field.key === "productMasterName"), true);
});

test("historical workshop facts remain queryable under finance.cost.read without a field-level permission gate", () => {
  const workPoint = FINANCE_COST_WORKSHOP_REPORTS_SOURCE.definition.fields.find((field) => field.key === "workPoint");
  const employeeId = FINANCE_COST_WORKSHOP_REPORTS_SOURCE.definition.fields.find((field) => field.key === "employeeId");

  assert.equal(FINANCE_COST_WORKSHOP_REPORTS_SOURCE.definition.parameters.some((parameter) => parameter.key === "importId"), true);
  assert.equal(workPoint?.sensitivity, "restricted");
  assert.equal(workPoint?.exportPolicy, "forbidden");
  assert.equal(workPoint?.capabilities.displayable, true);
  assert.equal(employeeId?.sensitivity, "restricted");
  assert.equal(employeeId?.capabilities.displayable, true);
});
