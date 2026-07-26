"use client";

import {
  PageSurface,
  createAnalysisSection,
  createPageBody,
  createPageTableSection,
  createStatusSection,
  type BodySurfaceSectionSpec,
  type DataSurfaceColumnSpec,
  type PageSurfaceTabBarSpec,
  type SurfaceToolbarItem,
  type SurfaceToolbarItems,
} from "@workspace/core/ui";
import type { ConsolidationOverview, StatementReportType } from "@workspace/finance/types";
import type { ConsolidationEliminationPackage } from "@workspace/finance/types";
import { useEffect, useState } from "react";

import {
  adjustmentComparisonExpandedRow,
  createAdjustmentComparisonColumns,
} from "./consolidation-columns";
import type {
  ConsolidationCapabilities,
} from "./statement-ui-types";
import { useConsolidationDecisionWorkspace } from "./useConsolidationDecisionWorkspace";

const ELIMINATION_PACKAGE_COLUMNS: DataSurfaceColumnSpec<ConsolidationEliminationPackage>[] = [
  { key: "item", label: "抵销项目", required: true, width: "lg", cell: (row) => ({ kind: "stack", gap: "xs", items: [
    { kind: "text", value: row.label, emphasis: "medium", wrap: "wrap" },
    { kind: "text", value: row.description, tone: "muted", wrap: "wrap" },
  ] }) },
  { key: "evidence", label: "核对资料", required: true, width: "xl", cell: (row) => row.requiredEvidence },
  { key: "check", label: "复核标准", required: true, width: "xl", cell: (row) => row.reviewCheck },
  { key: "status", label: "状态", required: true, width: "sm", cell: (row) => ({
    kind: "badge",
    label: row.status === "approved" ? "已通过" : row.status === "submitted" ? "待复核" : row.status === "draft" ? "草稿" : row.status === "sourceReady" ? "无适用事项" : "待处理",
    tone: row.status === "approved" || row.status === "sourceReady" ? "green" : "amber",
  }) },
];

export interface ConsolidationTabProps {
  capabilities: ConsolidationCapabilities;
  data: ConsolidationOverview | null;
  error: string | null;
  loading: boolean;
  sharedToolbarItems: SurfaceToolbarItems;
  reportType: StatementReportType;
  reportTypeToolbarItem: SurfaceToolbarItem;
  onRefresh: (freshBatch?: NonNullable<ConsolidationOverview["batch"]>) => void;
  onBatchDeleted: () => void;
  onStartEliminations: () => void;
  navigation: PageSurfaceTabBarSpec;
}

function fallbackSections(error: string | null, loading: boolean): BodySurfaceSectionSpec[] {
  if (loading) return [createStatusSection("consolidation-loading", { kind: "loading", content: "正在读取合并报表" })];
  return [createStatusSection("consolidation-error", { kind: "error", content: error || "合并报表加载失败" })];
}

export function ConsolidationEliminationTab(props: ConsolidationTabProps) {
  const { data, error, loading, navigation } = props;
  const workspace = useConsolidationDecisionWorkspace({
    data,
    capabilities: props.capabilities,
    onRefresh: props.onRefresh,
    onBatchDeleted: props.onBatchDeleted,
  });
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  useEffect(() => {
    const firstKey = data?.adjustmentComparisons[0]?.key;
    if (!firstKey) return;
    const currentKeys = new Set(data.adjustmentComparisons.map((row) => row.key));
    setExpandedKeys((current) => [...current].some((key) => currentKeys.has(key)) ? current : new Set([firstKey]));
  }, [data?.scope.batchId, data?.scope.month, data?.scope.year, data?.adjustmentComparisons]);
  const toggleExpanded = (key: string) => setExpandedKeys((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
  const comparisonColumns = createAdjustmentComparisonColumns({
    expandedKeys,
  });
  const reviewRows = data?.adjustmentComparisons ?? [];
  const approvedCount = reviewRows.filter((row) => row.reviewStatus === "approved").length;
  const exceptionCount = reviewRows.filter((row) => row.reviewStatus === "exception").length;
  const toolbarItems: SurfaceToolbarItems = [
    ...props.sharedToolbarItems,
    ...(data?.batch ? [{ kind: "text" as const, key: "review-summary", content: `${approvedCount} 组已通过 · ${exceptionCount} 组例外不阻断` }] : []),
  ];

  let sections: BodySurfaceSectionSpec[];
  if (!data) {
    sections = fallbackSections(error, loading);
  } else if (!data.batch) {
    sections = [createStatusSection("consolidation-batch-required", {
      kind: "empty",
      content: "请先在“合并准备”提交；系统会自动创建批次并生成抵销草稿。",
    })];
  } else {
    const investmentRows = data.adjustmentComparisons.filter((row) => row.category === "investment");
    const intercompanyRows = data.adjustmentComparisons.filter((row) => row.category === "intercompany");
    const categoryReviewActions = (
      rows: typeof investmentRows,
      categoryKey: "investment" | "intercompany",
      categoryLabel: "投资款" | "往来款",
    ) => {
      if (data.batch?.status !== "draft") return [];
      const reviewableRows = rows.filter((row) => row.entryId !== null && row.status === "equal");
      const approvableEntryIds = reviewableRows
        .filter((row) => row.reviewStatus !== "approved")
        .map((row) => row.entryId as number);
      const returnableEntryIds = reviewableRows
        .filter((row) => row.reviewStatus !== "returned")
        .map((row) => row.entryId as number);
      return [
        ...(approvableEntryIds.length > 0 && props.capabilities.canApprove ? [{
          key: `${categoryKey}-approve-all`,
          label: "全部通过",
          icon: "approve" as const,
          variant: "primary" as const,
          presentation: "text" as const,
          disabled: workspace.busy,
          onClick: () => void workspace.reviewEntries(approvableEntryIds, "approve", categoryLabel),
        }] : []),
        ...(returnableEntryIds.length > 0 && props.capabilities.canReject ? [{
          key: `${categoryKey}-return-all`,
          label: "全部退回",
          icon: "reject" as const,
          variant: "danger" as const,
          presentation: "text" as const,
          disabled: workspace.busy,
          onClick: () => void workspace.reviewEntries(returnableEntryIds, "return", categoryLabel),
        }] : []),
      ];
    };
    const eliminationRowActions = (row: ConsolidationEliminationPackage) => {
      const comparisonCount = row.key === "investment-equity" ? investmentRows.length : intercompanyRows.length;
      if (data.batch?.status !== "draft" || row.status !== "notStarted" || comparisonCount > 0) return [];
      return [{
        key: `no-applicable-${row.key}`,
        kind: "save" as const,
        label: "确认无事项",
        disabled: workspace.busy || !props.capabilities.canUpdate,
        onClick: () => void workspace.confirmNoElimination(row.key as "investment-equity" | "intercompany-balances", row.label),
      }];
    };
    sections = [
      createAnalysisSection("elimination-package-checklist", {
        title: "抵销项目清单",
        sections: [createPageTableSection("elimination-package-table", {
          rows: data.eliminations,
          columns: ELIMINATION_PACKAGE_COLUMNS,
          visibleColumns: ELIMINATION_PACKAGE_COLUMNS.map((column) => column.key),
          rowKey: (row) => row.key,
          rowActions: eliminationRowActions,
          actionsColumn: { label: "处理" },
          presentation: { density: "compact", cellWrap: "wrap" },
          emptyText: "当前没有待处理抵销项目",
        })],
      }),
      createAnalysisSection("investment-adjustments", {
        title: "投资款",
        actions: categoryReviewActions(investmentRows, "investment", "投资款"),
        sections: [createPageTableSection("investment-adjustment-table", {
          rows: investmentRows,
          columns: comparisonColumns,
          visibleColumns: comparisonColumns.map((column) => column.key),
          rowKey: (row) => row.key,
          onRowClick: (row) => toggleExpanded(row.key),
          expandedRowKeys: expandedKeys,
          expandedRow: adjustmentComparisonExpandedRow,
          rowState: (row) => row.reviewStatus === "returned" ? "danger" : row.reviewStatus === "pending" || row.reviewStatus === "exception" ? "warning" : "normal",
          presentation: { density: "compact", cellWrap: "wrap" },
          scroll: { y: "hidden" },
          emptyText: "当前期间没有投资款抵销事项",
        })],
      }),
      createAnalysisSection("intercompany-adjustments", {
        title: "往来款",
        actions: categoryReviewActions(intercompanyRows, "intercompany", "往来款"),
        sections: [createPageTableSection("intercompany-adjustment-table", {
          rows: intercompanyRows,
          columns: comparisonColumns,
          visibleColumns: comparisonColumns.map((column) => column.key),
          rowKey: (row) => row.key,
          onRowClick: (row) => toggleExpanded(row.key),
          expandedRowKeys: expandedKeys,
          expandedRow: adjustmentComparisonExpandedRow,
          rowState: (row) => row.reviewStatus === "returned" ? "danger" : row.reviewStatus === "pending" || row.reviewStatus === "exception" ? "warning" : "normal",
          presentation: { density: "compact", cellWrap: "wrap" },
          scroll: { y: "hidden" },
          emptyText: "当前期间没有客户或供应商公司间往来",
        })],
      }),
      ...workspace.lifecycleSections(),
    ];
  }
  if (data && error) sections = [createStatusSection("consolidation-refresh-error", { kind: "error", content: error }), ...sections];
  return <PageSurface kind="standard" tabbar={navigation} toolbar={{ items: toolbarItems }} body={createPageBody(sections)} />;
}
