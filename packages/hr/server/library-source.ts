import * as XLSX from "xlsx";

import type { AuthoritativeLibraryArtifact } from "@workspace/platform/server/authoritative-library-source-contract";
import { encodeAuthoritativeLibraryContent } from "@workspace/platform/server/authoritative-library-source-contract";
import { getTenantProfile } from "@workspace/platform/server/tenant-config";

import { listDepartments } from "./departments";
import { renderRosterGeneratedCsv } from "./roster-generated";

const OWNER_UNIT_ID = "hr";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function currentBusinessDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: getTenantProfile().localization.businessTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function organizationChartArtifact(): Promise<AuthoritativeLibraryArtifact> {
  const result = await listDepartments({
    keyword: "",
    page: 1,
    pageSize: 10_000,
    archived: false,
    summary: true,
  });
  const asOfDate = currentBusinessDate();
  const rows = result.departments.map((department) => [
    department.code,
    department.name,
    department.hierarchyKind,
    department.levelCode,
    department.parentName ?? "",
    department.managerPositionName ?? "",
    department.managerName ?? "",
    department.headcount,
  ]);
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ["组织编码", "组织名称", "层级体系", "组织层级", "上级组织", "负责人岗位", "组织负责人", "当前人数"],
    ...rows,
  ]);
  sheet["!cols"] = [
    { wch: 16 }, { wch: 32 }, { wch: 12 }, { wch: 14 },
    { wch: 32 }, { wch: 28 }, { wch: 24 }, { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(workbook, sheet, "组织架构");
  const content = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return {
    sourceKey: "organization-chart",
    ownerUnitId: OWNER_UNIT_ID,
    identityKey: "current-organization-chart",
    title: `组织架构（截至 ${asOfDate}）`,
    summary: `截至 ${asOfDate} 的 Workspace 组织架构，共 ${result.total} 个组织。`,
    fileName: `组织架构-${asOfDate}.xlsx`,
    mimeType: XLSX_MIME,
    extension: "xlsx",
    contentBase64: encodeAuthoritativeLibraryContent(content),
    asOfDate,
    verifiedAt: new Date().toISOString(),
    evidence: [`Department:active:${result.total}`, "source:workspace-hr"],
  };
}

async function dueDiligenceRosterArtifact(): Promise<AuthoritativeLibraryArtifact> {
  const csv = await renderRosterGeneratedCsv({ variant: "dueDiligence" });
  const sourceWorkbook = XLSX.read(`\ufeff${csv}`, { type: "string", raw: true });
  const firstSheetName = sourceWorkbook.SheetNames[0];
  if (firstSheetName && firstSheetName !== "尽调版花名册") {
    sourceWorkbook.Sheets["尽调版花名册"] = sourceWorkbook.Sheets[firstSheetName]!;
    delete sourceWorkbook.Sheets[firstSheetName];
    sourceWorkbook.SheetNames[0] = "尽调版花名册";
  }
  const asOfDate = currentBusinessDate();
  const rowCount = Math.max(0, csv.split("\n").length - 1);
  return {
    sourceKey: "roster-due-diligence",
    ownerUnitId: OWNER_UNIT_ID,
    identityKey: "current-due-diligence-roster",
    title: `尽调版花名册（截至 ${asOfDate}）`,
    summary: `截至 ${asOfDate} 的 Workspace 尽调版花名册。`,
    fileName: `尽调版花名册-${asOfDate}.xlsx`,
    mimeType: XLSX_MIME,
    extension: "xlsx",
    contentBase64: encodeAuthoritativeLibraryContent(
      XLSX.write(sourceWorkbook, { type: "buffer", bookType: "xlsx" }) as Buffer,
    ),
    asOfDate,
    verifiedAt: new Date().toISOString(),
    evidence: [`RosterGenerated:dueDiligence:rows:${rowCount}`, "scope:active-non-consultant"],
  };
}

export async function loadHrLibrarySource(sourceKey: string) {
  if (sourceKey === "organization-chart") return organizationChartArtifact();
  if (sourceKey === "roster-due-diligence") return dueDiligenceRosterArtifact();
  throw new Error("不支持的 HR 资料来源");
}
