import assert from "node:assert/strict";
import test from "node:test";

import * as XLSX from "xlsx";

import { decodeAuthoritativeLibraryContent } from "@workspace/platform/server/authoritative-library-source-contract";

import { buildContractLedgerArtifact } from "./library-source";
import type { ContractExportRecord } from "./contracts";

function contract(overrides: Partial<ContractExportRecord> = {}): ContractExportRecord {
  return {
    id: 1,
    contractUid: "00000000-0000-4000-8000-000000000001",
    version: 1,
    contractNo: "HT-001",
    name: "技术服务合同",
    partyA: "甲方",
    partyB: "乙方",
    shareholder: null,
    categoryId: 1,
    categoryName: "技术服务",
    content: null,
    owningCompanyId: null,
    owningCompanyName: null,
    ownerDepartmentId: null,
    ownerDepartmentName: null,
    partyAId: null,
    partyAIdentityName: null,
    partyBId: null,
    partyBIdentityName: null,
    handlerEmployeeId: null,
    handlerEmployeeName: "经办人",
    handlerEmployeeActive: true,
    signedOn: "2026-07-01",
    expiresOn: null,
    signedOnPrecision: "day",
    expiresOnPrecision: null,
    legacySignDateRaw: null,
    legacyEndDateRaw: null,
    lifecycleStatus: "active",
    signatureStatus: "signed",
    performanceStatus: "in_progress",
    legacyStatusRaw: null,
    amount: 100,
    executedAmount: 20,
    currencyCode: "CNY",
    confidentialityLevel: 2,
    location: "档案室",
    remark: null,
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

test("contract ledger artifact preserves rows and reports lifecycle-status completeness", () => {
  const artifact = buildContractLedgerArtifact(
    [contract(), contract({ id: 2, lifecycleStatus: "unknown", name: "待确认状态合同" })],
    new Date("2026-07-26T04:00:00.000Z"),
  );
  const workbook = XLSX.read(decodeAuthoritativeLibraryContent(artifact), { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets["合同台账"]!, { header: 1, raw: true });

  assert.equal(artifact.identityKey, "current-contract-ledger");
  assert.equal(artifact.asOfDate, "2026-07-26");
  assert.deepEqual(workbook.SheetNames, ["合同台账"]);
  assert.equal(rows.length, 3);
  assert.equal(rows[2]?.[4], "待确认状态合同");
  assert.equal(artifact.summary, "截至 2026-07-26 的 Workspace 合同台账，共 2 条。");
  assert.ok(artifact.evidence.includes("Contract:confirmed-lifecycle-status:1"));
  assert.ok(artifact.evidence.includes("Contract:needs-status-review:1"));
});
