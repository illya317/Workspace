import * as XLSX from "xlsx";

import type { AuthoritativeLibraryArtifact } from "@workspace/platform/server/authoritative-library-source-contract";
import { encodeAuthoritativeLibraryContent } from "@workspace/platform/server/authoritative-library-source-contract";

import { getInvestorRelationshipView } from "./investor-relationships";

const SOURCE_KEY = "ownership-structure";
const OWNER_UNIT_ID = "capital-securities";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function loadCapitalSecuritiesLibrarySource(
  sourceKey: string,
): Promise<AuthoritativeLibraryArtifact> {
  if (sourceKey !== SOURCE_KEY) throw new Error("不支持的资本证券资料来源");
  const view = await getInvestorRelationshipView({});
  const graph = view.ownershipStructure;
  if (!graph) throw new Error("Workspace 中还没有可用的集团股权结构");

  const nodeByKey = new Map(graph.nodes.map((node) => [node.key, node]));
  const rows = graph.edges.map((edge) => [
    nodeByKey.get(edge.source)?.label ?? edge.source,
    nodeByKey.get(edge.target)?.label ?? edge.target,
    edge.shareRatio,
    edge.previousShareRatio,
    edge.relationType === "share_capital" ? "股东持股" : "公司持股",
    edge.isConsolidated ? "是" : "否",
    edge.recordStatus === "confirmed" ? "已确认" : "待确认",
  ]);
  const groupRows = graph.groups.map((group) => [
    group.label,
    group.memberNodeKeys.map((key) => nodeByKey.get(key)?.label ?? key).join("、"),
    group.shareRatio,
    group.previousShareRatio,
    group.recordStatus === "confirmed" ? "已确认" : "待确认",
  ]);
  const workbook = XLSX.utils.book_new();
  const structureSheet = XLSX.utils.aoa_to_sheet([
    ["持股方", "被持股方", "持股比例", "上期比例", "关系类型", "纳入合并", "状态"],
    ...rows,
  ]);
  structureSheet["!cols"] = [
    { wch: 32 }, { wch: 32 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
  ];
  for (let rowIndex = 1; rowIndex <= rows.length; rowIndex += 1) {
    for (const columnIndex of [2, 3]) {
      const cell = structureSheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })];
      if (cell && typeof cell.v === "number") cell.z = "0.00%";
    }
  }
  XLSX.utils.book_append_sheet(workbook, structureSheet, "集团股权结构");

  if (groupRows.length > 0) {
    const groupSheet = XLSX.utils.aoa_to_sheet([
      ["股东阵营", "成员", "合计持股比例", "上期比例", "状态"],
      ...groupRows,
    ]);
    groupSheet["!cols"] = [{ wch: 24 }, { wch: 60 }, { wch: 16 }, { wch: 14 }, { wch: 12 }];
    for (let rowIndex = 1; rowIndex <= groupRows.length; rowIndex += 1) {
      for (const columnIndex of [2, 3]) {
        const cell = groupSheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })];
        if (cell && typeof cell.v === "number") cell.z = "0.00%";
      }
    }
    XLSX.utils.book_append_sheet(workbook, groupSheet, "股东阵营");
  }

  const content = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const generatedAt = new Date().toISOString();
  return {
    sourceKey,
    ownerUnitId: OWNER_UNIT_ID,
    identityKey: "current-ownership-structure",
    title: `集团股权结构（截至 ${graph.asOf}）`,
    summary: `截至 ${graph.asOf} 的 Workspace 集团股权结构。`,
    fileName: `集团股权结构-${graph.asOf}.xlsx`,
    mimeType: XLSX_MIME,
    extension: "xlsx",
    contentBase64: encodeAuthoritativeLibraryContent(content),
    asOfDate: graph.asOf,
    verifiedAt: generatedAt,
    evidence: [
      `OwnershipStructureGraph:${graph.rootCompanyId}:${graph.asOf}`,
      `nodes:${graph.nodes.length}`,
      `edges:${graph.edges.length}`,
    ],
  };
}
