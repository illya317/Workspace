import type {
  BodySurfaceCommandSpec,
  BodySurfaceSectionSpec,
  DataSurfaceStructuredCellSpec,
} from "@workspace/core/ui";
import type { InventoryReceiptMonthlySummary, InventoryReceiptRow } from "@workspace/inventory/types";

function numberText(value: number | null, digits = 4) {
  if (value === null) return "—";
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: digits }).format(value);
}

function textCell(value: string | number | null, options: Partial<DataSurfaceStructuredCellSpec> = {}): DataSurfaceStructuredCellSpec {
  return { content: value === null || value === "" ? { kind: "empty" } : { kind: "text", value: String(value) }, ...options };
}

function headerCell(value: string): DataSurfaceStructuredCellSpec {
  return { content: { kind: "text", value }, header: true, emphasis: "strong", align: "center" };
}

function formatDate(value: string | null, businessTimeZone: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("zh-CN", { timeZone: businessTimeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}.${part("month")}.${part("day")}`;
}

function signatureCell(items: string[]): DataSurfaceStructuredCellSpec {
  return {
    content: {
      kind: "group",
      direction: "row",
      items: items.map((value) => ({ kind: "text", value, wrap: "wrap" })),
    },
    colSpan: 10,
    cellRole: "signature",
  };
}

function groupedSummaryRows(rows: InventoryReceiptRow[]): DataSurfaceStructuredCellSpec[][] {
  let sequence = 0;
  const productKey = (row: InventoryReceiptRow) => [row.productName, row.specification ?? ""].join("\u0000");
  return rows.map((row, rowIndex) => {
    const cells: DataSurfaceStructuredCellSpec[] = [];
    const currentProductKey = productKey(row);
    const firstProductRow = rowIndex === 0 || productKey(rows[rowIndex - 1]) !== currentProductKey;
    let productRowSpan = 1;
    if (firstProductRow) {
      sequence += 1;
      while (rows[rowIndex + productRowSpan] && productKey(rows[rowIndex + productRowSpan]) === currentProductKey) productRowSpan += 1;
      cells.push(
        textCell(sequence, { rowSpan: productRowSpan, align: "center" }),
        textCell(row.productName, { rowSpan: productRowSpan, align: "center", emphasis: "medium" }),
        textCell(row.specification, { rowSpan: productRowSpan, align: "center" }),
      );
    }
    const firstBatchRow = rowIndex === 0 || rows[rowIndex - 1].batchId !== row.batchId;
    if (firstBatchRow) {
      let rowSpan = 1;
      while (rows[rowIndex + rowSpan]?.batchId === row.batchId) rowSpan += 1;
      cells.push(
        textCell(row.batchNumber, { rowSpan, align: "center" }),
        textCell(numberText(row.inputQuantityTenThousands), { rowSpan, align: "right" }),
      );
    }
    if (firstProductRow) {
      cells.push(textCell(row.workPoints, { rowSpan: productRowSpan, align: "right" }));
    }
    cells.push(
      textCell(row.productionQuantityText, { align: "center" }),
      textCell(numberText(row.convertedPackages), { align: "right" }),
      textCell(numberText(row.convertedTenThousands, 6), { align: "right" }),
      textCell(row.packagingNote, { align: "center" }),
    );
    return cells;
  });
}

function statusBadge(status: InventoryReceiptMonthlySummary["report"]["status"]) {
  if (status === "approved") return { key: "status", label: "已复核", tone: "success" as const };
  if (status === "submitted") return { key: "status", label: "待复核", tone: "warning" as const };
  return { key: "status", label: "待确认", tone: "muted" as const };
}

export function buildInventoryReceiptSummarySection(
  summary: InventoryReceiptMonthlySummary,
  actions: BodySurfaceCommandSpec[],
  businessTimeZone: string,
): BodySurfaceSectionSpec {
  const { report, totals } = summary;
  const rows: DataSurfaceStructuredCellSpec[][] = [
    ["序号", "品种", "规格", "批号", "投料量（万粒/片）", "工分", "生产数量（件）", "折合（盒/瓶）", "折合（万粒/片）", "备注"].map(headerCell),
    ...groupedSummaryRows(summary.rows),
    [
      textCell("合计", { colSpan: 4, align: "center", emphasis: "strong" }),
      textCell(numberText(totals.inputQuantityTenThousands), { align: "right", emphasis: "strong" }),
      textCell(numberText(totals.workPoints), { align: "right", emphasis: "strong" }),
      textCell(null),
      textCell(numberText(totals.convertedPackages), { align: "right", emphasis: "strong" }),
      textCell(numberText(totals.convertedTenThousands, 6), { align: "right", emphasis: "strong" }),
      textCell(null),
    ],
    [signatureCell([
      `制表人：${report.preparedBy ?? "—"}`,
      `制表日期：${formatDate(report.preparedAt, businessTimeZone)}`,
      `复核人：${report.reviewedBy ?? "—"}`,
      `复核日期：${formatDate(report.reviewedAt, businessTimeZone)}`,
    ])],
  ];
  return {
    key: "inventory-receipts-summary",
    header: {
      title: `${report.year}年${String(report.month).padStart(2, "0")}月${report.workshopName}生产成品入库报表`,
      badges: [statusBadge(report.status), ...(!summary.snapshotCurrent ? [{ key: "stale", label: "确认数据已变化", tone: "danger" as const }] : [])],
      actions,
    },
    body: {
      kind: "data",
      data: {
        kind: "structured",
        rows,
        colWidths: ["3.5rem", "8rem", "5rem", "7rem", "7rem", "6rem", "7rem", "7rem", "7rem", "11rem"],
        frame: "bordered",
        structuredScroll: true,
        scroll: { x: true },
        mobile: { presentation: "landscape", title: "生产成品入库汇总表" },
        presentation: { density: "compact", header: "tinted", grid: "cells", cellWrap: "wrap" },
      },
    },
  };
}
