"use client";

import {
  PageSurface,
  createPageBody,
  createPageTableSection,
  createStatusSection,
  useFeedback,
  type BodySurfaceSectionSpec,
  type DataSurfaceColumnSpec,
} from "@workspace/core/ui";
import { workspacePath } from "@workspace/core/routing";
import type { NciEquityMovement } from "@workspace/finance/types";
import { useCallback, useState } from "react";

import { downloadFinanceWorkbook } from "../workbook-download";
import type { ConsolidationTabProps } from "./statement-ui-types";
import { useConsolidatedReport } from "./useConsolidatedReport";

interface SummaryRow {
  key: string;
  label: string;
  amount: number;
  kind: "movement" | "total" | "check";
}

const MOVEMENT_COLUMNS: DataSurfaceColumnSpec<NciEquityMovement>[] = [
  { key: "date", label: "日期", width: "md", cell: (row) => row.postingDate ?? "期初" },
  { key: "company", label: "主体", width: "lg", cell: (row) => row.companyName ? `${row.companyCode ?? ""} · ${row.companyName}` : "集团" },
  { key: "movement", label: "权益变动", required: true, width: "lg", cell: (row) => row.label },
  { key: "entry", label: "合并凭证", width: "md", cell: (row) => row.entryNo ?? "—" },
  { key: "evidence", label: "来源与证据", width: "xl", cell: (row) => row.evidence },
  { key: "amount", label: "少数股东份额", required: true, width: "md", align: "right", cell: (row) => ({ kind: "amount", value: row.amount }) },
];

const SUMMARY_COLUMNS: DataSurfaceColumnSpec<SummaryRow>[] = [
  { key: "label", label: "勾稽项目", required: true, width: "xl", cell: (row) => row.label },
  { key: "amount", label: "金额", required: true, width: "md", align: "right", cell: (row) => ({ kind: "amount", value: row.amount }) },
];

export function NciEquityWorksheetTab(props: ConsolidationTabProps) {
  const { data, error: overviewError, loading: overviewLoading, navigation } = props;
  const feedback = useFeedback();
  const [downloading, setDownloading] = useState(false);
  const batch = data?.batch ?? null;
  const output = useConsolidatedReport(batch?.id ?? null, batch?.status ?? null, batch?.revision ?? null);
  const workpaper = output.report?.nciEquityWorkpaper ?? null;
  const canExport = props.capabilities.canExport;
  const parentName = data?.scope.parent?.name || "合并主体";
  const downloadWorkbook = useCallback(async () => {
    if (!canExport || !batch || !data) return;
    setDownloading(true);
    try {
      await downloadFinanceWorkbook(
        workspacePath(`/api/modules/finance/statements/consolidation/batches/${batch.id}/report/export?artifact=nciWorkpaper`),
        `${parentName}-${data.scope.year}.${String(data.scope.month).padStart(2, "0")}-少数股东底稿.xlsx`,
      );
    } catch (cause) {
      feedback.error(cause instanceof Error ? cause.message : "少数股东底稿下载失败");
    } finally {
      setDownloading(false);
    }
  }, [batch, canExport, data, feedback, parentName]);
  const toolbar = {
    items: [
      ...props.sharedToolbarItems,
      ...(canExport ? [{
        kind: "action-group" as const,
        key: "nci-workpaper-actions",
        actions: [{
          key: "export",
          label: downloading ? "下载中" : "下载少数股东底稿",
          kind: "export" as const,
          disabled: downloading || !workpaper,
          onClick: () => void downloadWorkbook(),
        }],
      }] : []),
    ],
  };
  let sections: BodySurfaceSectionSpec[];
  if (!data) {
    sections = [createStatusSection("nci-workpaper-overview-status", {
      kind: overviewLoading ? "loading" : "error",
      content: overviewLoading ? "正在读取合并批次" : overviewError || "合并批次加载失败",
    })];
  } else if (!batch) {
    sections = [createStatusSection("nci-workpaper-batch-required", { kind: "empty", content: "请先在“合并准备”生成工作底稿。" })];
  } else if (output.loading) {
    sections = [createStatusSection("nci-workpaper-loading", { kind: "loading", content: "正在计算少数股东权益变动" })];
  } else if (!workpaper) {
    sections = [createStatusSection("nci-workpaper-error", { kind: output.error ? "error" : "empty", content: output.error || "当前批次尚未形成少数股东权益底稿" })];
  } else {
    const summary: SummaryRow[] = [
      { key: "opening", label: "期初少数股东权益", amount: workpaper.openingBalance, kind: "movement" },
      { key: "contributions", label: "加：少数股东投入", amount: workpaper.contributions, kind: "movement" },
      { key: "profit", label: "加：少数股东应占净利润", amount: workpaper.profitLoss, kind: "movement" },
      { key: "oci", label: "加：少数股东应占其他综合收益", amount: workpaper.otherComprehensiveIncome, kind: "movement" },
      { key: "distributions", label: "减：向少数股东分红", amount: workpaper.distributions, kind: "movement" },
      { key: "ownership", label: "加减：持股比例变化", amount: workpaper.ownershipChanges, kind: "movement" },
      { key: "other", label: "加减：其他有证据调整", amount: workpaper.otherAdjustments, kind: "movement" },
      { key: "calculated", label: "变动表计算期末余额", amount: workpaper.calculatedClosingBalance, kind: "total" },
      { key: "reported", label: "合并资产负债表期末余额", amount: workpaper.reportedClosingBalance, kind: "check" },
      { key: "rollforward-difference", label: "变动表勾稽差异", amount: workpaper.rollforwardDifference, kind: "check" },
      { key: "cross-check", label: "期末净资产×有效少数股东比例（仅复核）", amount: workpaper.netAssetsCrossCheck, kind: "check" },
      { key: "cross-check-difference", label: "比例复核差异", amount: workpaper.crossCheckDifference, kind: "check" },
    ];
    sections = [
      {
        ...createPageTableSection("nci-rollforward-summary", {
          rows: summary,
          columns: SUMMARY_COLUMNS,
          visibleColumns: SUMMARY_COLUMNS.map((column) => column.key),
          rowKey: (row) => row.key,
          rowState: (row) => row.kind === "total"
            ? "total"
            : row.key.includes("difference") && Math.abs(row.amount) >= 0.005
              ? "warning"
              : "normal",
          presentation: { density: "compact", cellWrap: "nowrap" },
          emptyText: "当前期间没有少数股东权益变动",
        }),
        header: { title: workpaper.status === "difference"
          ? "少数股东权益变动表 · 变动勾稽存在差异"
          : workpaper.crossCheckStatus === "difference"
            ? "少数股东权益变动表 · 变动已勾稽，比例复核有差异"
            : "少数股东权益变动表 · 已勾稽" },
      },
      {
        ...createPageTableSection("nci-rollforward-movements", {
          rows: workpaper.movements,
          columns: MOVEMENT_COLUMNS,
          visibleColumns: MOVEMENT_COLUMNS.map((column) => column.key),
          rowKey: (row) => row.key,
          presentation: { density: "compact", cellWrap: "wrap" },
          scroll: { x: true },
          emptyText: "当前期间没有少数股东权益变动明细",
        }),
        header: { title: `变动来源（${workpaper.movements.length}）` },
      },
    ];
  }
  return <PageSurface kind="standard" tabbar={navigation} toolbar={toolbar} body={createPageBody(sections)} />;
}
