import assert from "node:assert/strict";
import test from "node:test";
import { renderContractsCsv, type ContractExportRecord } from "./contracts";

function contract(overrides: Partial<ContractExportRecord> = {}): ContractExportRecord {
  return {
    id: 7,
    contractUid: "00000000-0000-4000-8000-000000000007",
    version: 2,
    contractNo: "C-007",
    name: "服务合同,一期",
    partyA: "甲方",
    partyB: "乙方",
    shareholder: null,
    categoryId: 1,
    categoryName: "服务",
    content: "第一行\n第二行",
    owningCompanyId: null,
    owningCompanyName: null,
    ownerDepartmentId: null,
    ownerDepartmentName: null,
    partyAId: null,
    partyAIdentityName: null,
    partyBId: null,
    partyBIdentityName: null,
    handlerEmployeeId: 1,
    handlerEmployeeName: "经办人",
    handlerEmployeeActive: true,
    signedOn: "2026-07-01",
    expiresOn: "2027-06-30",
    signedOnPrecision: "day",
    expiresOnPrecision: "day",
    legacySignDateRaw: null,
    legacyEndDateRaw: null,
    lifecycleStatus: "active",
    signatureStatus: "signed",
    performanceStatus: "in_progress",
    legacyStatusRaw: null,
    amount: 1200,
    executedAmount: null,
    currencyCode: "CNY",
    confidentialityLevel: 2,
    location: "上海",
    remark: "备注",
    approvalSourceKey: null,
    approvalRecordId: null,
    approvalRecordUrl: null,
    approvalStatusSnapshot: null,
    approvedOn: null,
    approvalSyncedAt: null,
    currentRevisionId: 1,
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
    editedBy: 1,
    editedAt: "2026-07-01T00:00:00.000Z",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    dataQualityIssues: [],
    canHardDelete: false,
    ...overrides,
  };
}

test("contract export renders normalized master data and escapes CSV values", () => {
  const csv = renderContractsCsv([contract()]);

  assert.match(csv, /^ID,系统标识,版本,合同编号/);
  assert.match(csv, /"服务合同,一期"/);
  assert.match(csv, /"第一行\n第二行"/);
  assert.match(csv, /有效,已签署,履行中/);
  assert.match(csv, /1200/);
});
