import {
  createMessageSection,
  createPageDataSection,
  createPanelSection,
  createSectionsSection,
  type BodySurfaceSectionSpec,
} from "@workspace/core/ui";
import type {
  ConsolidatedOutputLine,
  ConsolidatedStatementOutput,
  StatementReportType,
} from "@workspace/finance/types";

import { createReportLinesSurface, type ReportLine } from "./ReportLines";

export const CONSOLIDATED_REPORT_TYPE_OPTIONS = [
  { value: "balanceSheet", label: "合并资产负债表" },
  { value: "incomeStatement", label: "合并利润表" },
  { value: "cashFlow", label: "合并现金流量表" },
] satisfies { value: StatementReportType; label: string }[];

const ASSET_SECTIONS = new Set(["currentAssets", "nonCurrentAssets"]);

function reportLines(lines: readonly ConsolidatedOutputLine[]): ReportLine[] {
  return lines.map((line) => ({
    label: line.label,
    amount: line.amount,
    previousAmount: line.previousAmount,
    isHeader: line.isHeader,
    isTotal: line.isTotal,
    isGrandTotal: line.isGrandTotal,
  }));
}

function staticLinesSurface(input: {
  items: ReportLine[];
  labelHeader: string;
  previousAmountHeader: string;
  amountHeader: string;
}) {
  return createReportLinesSurface({
    ...input,
    expandedCodes: new Set(),
    details: {},
    loadingDetail: null,
    onToggle: () => undefined,
  });
}

export function createConsolidatedReportSection(
  statement: ConsolidatedStatementOutput,
  context: { parentName: string; year: number; month: number },
): BodySurfaceSectionSpec {
  if (statement.reportType === "balanceSheet") {
    const assetLines = statement.lines.filter((line) => ASSET_SECTIONS.has(line.section) || line.lineCode === "totalAssets");
    const liabilityEquityLines = statement.lines.filter((line) => !ASSET_SECTIONS.has(line.section) && line.lineCode !== "totalAssets");
    const totalLiabilities = statement.lines.find((line) => line.lineCode === "totalLiabilities");
    const totalEquity = statement.lines.find((line) => line.lineCode === "totalEquity");
    liabilityEquityLines.push({
      lineCode: "totalLiabilitiesAndEquity",
      label: "负债和所有者权益（或股东权益）总计",
      code: null,
      amount: (totalLiabilities?.amount ?? 0) + (totalEquity?.amount ?? 0),
      previousAmount: (totalLiabilities?.previousAmount ?? 0) + (totalEquity?.previousAmount ?? 0),
      section: "equity",
      side: "credit",
      direction: null,
      subtract: false,
      isHeader: false,
      isTotal: false,
      isGrandTotal: true,
      sourceAmount: 0,
      adjustmentAmount: 0,
    });
    return createPanelSection("consolidated-balance-report", {
      title: "合 并 资 产 负 债 表",
      sections: [
        createMessageSection("consolidated-balance-meta", {
          tone: "muted",
          content: `编制单位：${context.parentName}　${context.year}年${context.month}月　单位：元`,
        }),
        createSectionsSection("consolidated-balance-columns", {
          layout: "grid",
          gridColumns: 2,
          sections: [
            createPageDataSection("consolidated-assets", staticLinesSurface({
              items: reportLines(assetLines),
              labelHeader: "资产",
              previousAmountHeader: "期初余额",
              amountHeader: "期末余额",
            })),
            createPageDataSection("consolidated-liabilities-equity", staticLinesSurface({
              items: reportLines(liabilityEquityLines),
              labelHeader: "负债和所有者权益（或股东权益）",
              previousAmountHeader: "期初余额",
              amountHeader: "期末余额",
            })),
          ],
        }),
      ],
    });
  }

  const title = statement.reportType === "incomeStatement" ? "合 并 利 润 表" : "合 并 现 金 流 量 表";
  const labelHeader = statement.reportType === "incomeStatement" ? "项 目" : "项 目";
  return createPanelSection(`consolidated-${statement.reportType}-report`, {
    title,
    sections: [
      createMessageSection(`consolidated-${statement.reportType}-meta`, {
        tone: "muted",
        content: `编制单位：${context.parentName}　${context.year}年${context.month}月　单位：元`,
      }),
      createPageDataSection(`consolidated-${statement.reportType}-lines`, staticLinesSurface({
        items: reportLines(statement.lines),
        labelHeader,
        previousAmountHeader: `${context.year - 1}年金额`,
        amountHeader: `${context.year}年金额`,
      })),
    ],
  });
}
