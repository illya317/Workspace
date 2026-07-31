import {
  createAnalysisSection,
  createMessageSection,
  createPageDataSection,
  type DataSurfaceStructuredCellSpec,
} from "@workspace/core/ui";
import type { InvestorRelationshipView } from "../types";

/** @ui-structural-declaration */
export function createInvestorCaptableSections({
  data,
  asOf,
  captableRows,
  financingRows,
}: {
  data: InvestorRelationshipView | null;
  asOf: string;
  captableRows: DataSurfaceStructuredCellSpec[][];
  financingRows: DataSurfaceStructuredCellSpec[][];
}) {
  return [
    createMessageSection("captable-rule", {
      tone: data?.metrics.pendingEventCount ? "warning" : "muted",
      content: data?.metrics.pendingEventCount
        ? `口径：认缴注册资本｜单位：万元｜基准日：${asOf}｜黄色轮次为待变更，暂不计入当前已登记股权。持股比例和估值均由注册资本与实际出资自动计算。`
        : `口径：认缴注册资本｜单位：万元｜基准日：${asOf}。持股比例和估值均由注册资本与实际出资自动计算。`,
    }),
    createAnalysisSection("captable", {
      title: `${data?.selectedCompany?.name ?? ""}股权结构表`,
      sections: [createPageDataSection("captable-table", {
        kind: "structured",
        rows: captableRows,
        structuredScroll: true,
        format: {
          kind: "matrix",
          columnWidths: [
            "11rem",
            ...(data?.captableRounds ?? []).flatMap(() => ["8rem", "6rem"]),
          ],
          headerRowHeight: "4rem",
          bodyRowHeight: "3rem",
        },
        frame: "clipped",
        scroll: { x: true, y: "hidden" },
        mobile: {
          presentation: "landscape",
          title: "股权结构表",
          reason: "股权结构表是跨轮次比较矩阵，请横屏查看完整轮次。",
        },
        presentation: {
          density: "compact",
          header: "strong",
          grid: "cells",
          cellWrap: "nowrap",
          controlHeight: "auto",
        },
      })],
    }),
    createAnalysisSection("financing-rounds", {
      title: "各轮估值与出资",
      sections: [createPageDataSection("financing-rounds-table", {
        kind: "structured",
        rows: financingRows,
        structuredScroll: true,
        format: {
          kind: "matrix",
          columnWidths: [
            "13rem",
            ...(data?.financingRounds ?? []).map(() => "11rem"),
          ],
          headerRowHeight: "4rem",
          bodyRowHeight: "3rem",
        },
        frame: "clipped",
        scroll: { x: true, y: "hidden" },
        mobile: {
          presentation: "landscape",
          title: "各轮估值与出资",
          reason: "估值与出资按轮次横向比较，请横屏查看。",
        },
        presentation: {
          density: "compact",
          header: "strong",
          grid: "cells",
          cellWrap: "nowrap",
          controlHeight: "auto",
        },
      })],
    }),
  ];
}
