"use client";

import {
  PageSurface,
  createPageBody,
  createStatusSection,
  type BodySurfaceSectionSpec,
} from "@workspace/core/ui";
import type { StatementReportType } from "@workspace/finance/types";
import { useMemo, useState } from "react";

import {
  CONSOLIDATED_REPORT_TYPE_OPTIONS,
  createConsolidatedReportSection,
} from "./consolidated-report-model";
import {
  type ConsolidationTabProps,
  usePeriodToolbar,
} from "./ConsolidationTabs";
import { useConsolidatedReport } from "./useConsolidatedReport";

export function ConsolidatedReportTab(props: ConsolidationTabProps) {
  const { data, error: overviewError, loading: overviewLoading, navigation } = props;
  const [reportType, setReportType] = useState<StatementReportType>("balanceSheet");
  const batchStatus = data?.batch?.status ?? null;
  const output = useConsolidatedReport(data?.batch?.id ?? null, batchStatus);
  const toolbarItems = usePeriodToolbar(props);
  const toolbar = useMemo(() => ({
    items: [
      ...toolbarItems,
      {
        kind: "select" as const,
        key: "reportType",
        label: "合并报表",
        options: CONSOLIDATED_REPORT_TYPE_OPTIONS,
        value: reportType,
        onChange: (value: string) => setReportType(value as StatementReportType),
      },
    ],
  }), [reportType, toolbarItems]);

  let sections: BodySurfaceSectionSpec[];
  if (!data) {
    sections = [createStatusSection("consolidated-overview-status", {
      kind: overviewLoading ? "loading" : "error",
      content: overviewLoading ? "正在读取合并批次" : overviewError || "合并批次加载失败",
    })];
  } else if (output.loading) {
    sections = [createStatusSection("consolidated-report-loading", { kind: "loading", content: "正在生成合并报表" })];
  } else if (!output.report) {
    sections = output.error
      ? [createStatusSection("consolidated-report-error", { kind: "error", content: output.error })]
      : [];
  } else {
    const statement = output.report.statements.find((item) => item.reportType === reportType)
      ?? output.report.statements[0];
    sections = statement ? [createConsolidatedReportSection(statement, {
      parentName: data.scope.parent?.fullName || data.scope.parent?.name || "合并主体",
      year: data.scope.year,
      month: data.scope.month,
    })] : [];
  }

  return <PageSurface kind="standard" tabbar={navigation} toolbar={toolbar} body={createPageBody(sections)} />;
}
