import * as XLSX from "xlsx";

import type { AuthoritativeLibraryArtifact } from "@workspace/platform/server/authoritative-library-source-contract";
import { encodeAuthoritativeLibraryContent } from "@workspace/platform/server/authoritative-library-source-contract";
import { getTenantProfile } from "@workspace/platform/server/tenant-config";

import {
  loadContractExportRecords,
  renderContractsCsv,
  type ContractExportRecord,
} from "./contracts";

const SOURCE_KEY = "contract-ledger";
const OWNER_UNIT_ID = "administration";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function businessDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: getTenantProfile().localization.businessTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function buildContractLedgerArtifact(
  records: readonly ContractExportRecord[],
  generatedAt: Date,
): AuthoritativeLibraryArtifact {
  const csv = renderContractsCsv(records);
  const workbook = XLSX.read(`\ufeff${csv}`, { type: "string", raw: true });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error("合同台账没有可导出的工作表");
  if (firstSheetName !== "合同台账") {
    workbook.Sheets["合同台账"] = workbook.Sheets[firstSheetName]!;
    delete workbook.Sheets[firstSheetName];
    workbook.SheetNames[0] = "合同台账";
  }
  const sheet = workbook.Sheets["合同台账"]!;
  sheet["!cols"] = [
    { wch: 10 }, { wch: 8 }, { wch: 20 }, { wch: 36 }, { wch: 28 }, { wch: 28 },
    { wch: 24 }, { wch: 18 }, { wch: 48 }, { wch: 18 }, { wch: 14 }, { wch: 14 },
    { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 28 }, { wch: 48 },
  ];
  const content = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const asOfDate = businessDate(generatedAt);
  const withStatus = records.filter((record) => Boolean(record.status?.trim())).length;
  const withoutStatus = records.length - withStatus;

  return {
    sourceKey: SOURCE_KEY,
    ownerUnitId: OWNER_UNIT_ID,
    identityKey: "current-contract-ledger",
    title: `合同台账（截至 ${asOfDate}）`,
    summary: `截至 ${asOfDate} 的 Workspace 合同台账，共 ${records.length} 条。`,
    fileName: `合同台账-${asOfDate}.xlsx`,
    mimeType: XLSX_MIME,
    extension: "xlsx",
    contentBase64: encodeAuthoritativeLibraryContent(content),
    asOfDate,
    verifiedAt: generatedAt.toISOString(),
    evidence: [
      `Contract:total:${records.length}`,
      `Contract:with-status:${withStatus}`,
      `Contract:without-status:${withoutStatus}`,
      "source:workspace-administration",
    ],
  };
}

export async function loadAdministrationLibrarySource(sourceKey: string) {
  if (sourceKey !== SOURCE_KEY) throw new Error("不支持的 Administration 资料来源");
  return buildContractLedgerArtifact(await loadContractExportRecords(), new Date());
}
