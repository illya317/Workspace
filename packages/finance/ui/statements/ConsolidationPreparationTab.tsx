"use client";

import {
  PageSurface,
  createAnalysisSection,
  createPageBody,
  createPageTableSection,
  createStatusSection,
  type BodySurfaceSectionSpec,
} from "@workspace/core/ui";

import { consolidationEntityColumns } from "./consolidation-columns";
import {
  type ConsolidationTabProps,
} from "./ConsolidationTabs";
import { useConsolidationDecisionWorkspace } from "./useConsolidationDecisionWorkspace";

export function ConsolidationPreparationTab(props: ConsolidationTabProps) {
  const { data, error, loading, navigation } = props;
  const workspace = useConsolidationDecisionWorkspace({
    data,
    capabilities: props.capabilities,
    onRefresh: props.onRefresh,
    onBatchDeleted: props.onBatchDeleted,
  });

  let sections: BodySurfaceSectionSpec[];
  if (!data) {
    sections = [createStatusSection("consolidation-preparation-status", {
      kind: loading ? "loading" : "error",
      content: loading ? "正在读取合并准备状态" : error || "合并准备状态加载失败",
    })];
  } else {
    sections = [
      ...workspace.preparationSections(props.onStartEliminations),
      createAnalysisSection("consolidation-scope", {
        title: "合并范围与个别报表",
        sections: [createPageTableSection("consolidation-entity-table", {
          rows: data.entities,
          columns: consolidationEntityColumns,
          visibleColumns: consolidationEntityColumns.map((column) => column.key),
          rowKey: (row) => row.entitySnapshotId ?? row.companyId ?? row.code,
          presentation: { density: "compact", cellWrap: "wrap" },
          scroll: { x: true },
          emptyText: "当前期间没有纳入合并范围的主体",
        })],
      }),
    ];
    if (error) {
      sections = [createStatusSection("consolidation-preparation-refresh-error", { kind: "error", content: error }), ...sections];
    }
  }

  return <PageSurface kind="standard" tabbar={navigation} toolbar={{ items: props.sharedToolbarItems }} body={createPageBody(sections)} />;
}
