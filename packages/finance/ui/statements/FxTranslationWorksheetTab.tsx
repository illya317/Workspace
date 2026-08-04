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
import { useCallback, useMemo, useState } from "react";

import {
  consolidationFxTranslationRows,
  type ConsolidationFxTranslationRow,
} from "./consolidation-workpaper-model";
import type { ConsolidationTabProps } from "./statement-ui-types";
import { useConsolidatedReport } from "./useConsolidatedReport";
import { downloadStatementWorkbook } from "./ConsolidationWorksheetTab";

const COLUMNS: DataSurfaceColumnSpec<ConsolidationFxTranslationRow>[] = [
  { key: "company", label: "外币公司", required: true, width: "lg", cell: (row) => row.companyLabel },
  { key: "item", label: "报表项目", required: true, width: "xl", cell: (row) => row.lineLabel },
  { key: "source", label: "原币金额", required: true, width: "md", align: "right", cell: (row) => `${row.sourceAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${row.sourceCurrency}` },
  { key: "basis", label: "折算依据", required: true, width: "lg", cell: (row) => row.rateBasisLabel },
  { key: "rate", label: "适用汇率", required: true, width: "md", cell: (row) => row.rateDisplay },
  { key: "translated", label: "折算后金额", required: true, width: "md", align: "right", cell: (row) => `${row.translatedAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${row.presentationCurrency}` },
];

export function FxTranslationWorksheetTab(props: ConsolidationTabProps) {
  const { data, error: overviewError, loading: overviewLoading, navigation } = props;
  const feedback = useFeedback();
  const [downloading, setDownloading] = useState(false);
  const batch = data?.batch ?? null;
  const output = useConsolidatedReport(batch?.id ?? null, batch?.status ?? null, batch?.revision ?? null);
  const statement = output.report?.statements.find((item) => item.reportType === props.reportType) ?? null;
  const rows = useMemo(() => statement ? consolidationFxTranslationRows(statement) : [], [statement]);
  const parentName = data?.scope.parent?.name || "合并主体";
  const canExport = props.capabilities.canExport;

  const downloadWorkbook = useCallback(async () => {
    if (!canExport || !batch || !data) return;
    setDownloading(true);
    try {
      await downloadStatementWorkbook(
        workspacePath(`/api/modules/finance/statements/consolidation/batches/${batch.id}/report/export?artifact=fxWorkpaper`),
        `${parentName}-${data.scope.year}.${String(data.scope.month).padStart(2, "0")}-外币报表折算底稿.xlsx`,
      );
    } catch (cause) {
      feedback.error(cause instanceof Error ? cause.message : "外币报表折算底稿下载失败");
    } finally {
      setDownloading(false);
    }
  }, [batch, canExport, data, feedback, parentName]);

  const toolbar = {
    items: [
      ...props.sharedToolbarItems,
      props.reportTypeToolbarItem,
      ...(canExport ? [{
        kind: "action-group" as const,
        key: "fx-workpaper-actions",
        actions: [{
          key: "export",
          label: downloading ? "下载中" : "下载外币底稿",
          kind: "export" as const,
          disabled: downloading || !output.report,
          onClick: () => void downloadWorkbook(),
        }],
      }] : []),
    ],
  };

  let sections: BodySurfaceSectionSpec[];
  if (!data) {
    sections = [createStatusSection("fx-workpaper-overview-status", {
      kind: overviewLoading ? "loading" : "error",
      content: overviewLoading ? "正在读取合并批次" : overviewError || "合并批次加载失败",
    })];
  } else if (!batch) {
    sections = [createStatusSection("fx-workpaper-batch-required", { kind: "empty", content: "请先在“合并准备”生成工作底稿。" })];
  } else if (output.loading) {
    sections = [createStatusSection("fx-workpaper-loading", { kind: "loading", content: "正在重放外币报表折算底稿" })];
  } else if (!output.report || !statement) {
    sections = [createStatusSection("fx-workpaper-error", { kind: output.error ? "error" : "empty", content: output.error || "当前批次尚未形成外币报表折算底稿" })];
  } else if (rows.length === 0) {
    sections = [createStatusSection("fx-workpaper-empty", { kind: "empty", content: "当前合并范围没有本位币不同于集团列报币种的公司。" })];
  } else {
    sections = [{
      ...createPageTableSection("foreign-currency-translation-workpaper", {
        rows,
        columns: COLUMNS,
        visibleColumns: COLUMNS.map((column) => column.key),
        rowKey: (row) => row.key,
        rowState: (row) => row.isTotal ? "total" : "normal",
        presentation: { density: "compact", cellWrap: "nowrap" },
        scroll: { x: true },
        emptyText: "当前报表没有需要折算的项目",
      }),
      header: { title: `${statement.label} · 外币报表折算底稿` },
    }];
  }

  return <PageSurface kind="standard" tabbar={navigation} toolbar={toolbar} body={createPageBody(sections)} />;
}
