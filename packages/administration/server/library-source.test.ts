import assert from "node:assert/strict";
import test from "node:test";

import * as XLSX from "xlsx";

import { decodeAuthoritativeLibraryContent } from "@workspace/platform/server/authoritative-library-source-contract";

import { buildContractLedgerArtifact } from "./library-source";
import type { ContractExportRecord } from "./contracts";

function contract(overrides: Partial<ContractExportRecord> = {}): ContractExportRecord {
  return {
    id: 1,
    version: 1,
    contractNo: "HT-001",
    name: "技术服务合同",
    partyA: "甲方",
    partyB: "乙方",
    shareholder: null,
    category: "技术服务",
    content: null,
    handlerEmployeeId: null,
    handlerEmployeeName: "经办人",
    handlerEmployeeActive: true,
    signDate: "2026-07-01",
    endDate: null,
    status: "执行中",
    amount: 100,
    executedAmount: 20,
    location: "档案室",
    remark: null,
    ...overrides,
  };
}

test("contract ledger artifact preserves all rows and keeps status completeness in evidence", () => {
  const artifact = buildContractLedgerArtifact(
    [contract(), contract({ id: 2, status: null, name: "无状态合同" })],
    new Date("2026-07-26T04:00:00.000Z"),
  );
  const workbook = XLSX.read(decodeAuthoritativeLibraryContent(artifact), { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets["合同台账"]!, { header: 1, raw: true });

  assert.equal(artifact.identityKey, "current-contract-ledger");
  assert.equal(artifact.asOfDate, "2026-07-26");
  assert.deepEqual(workbook.SheetNames, ["合同台账"]);
  assert.equal(rows.length, 3);
  assert.equal(rows[2]?.[3], "无状态合同");
  assert.equal(artifact.summary, "截至 2026-07-26 的 Workspace 合同台账，共 2 条。");
  assert.ok(artifact.evidence.includes("Contract:with-status:1"));
  assert.ok(artifact.evidence.includes("Contract:without-status:1"));
});
