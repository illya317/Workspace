"use client";

import {
  PageSurface,
  createAnalysisSection,
  createPageBody,
  createPageTableSection,
  createStatusSection,
  useFeedback,
  type BodySurfaceSectionSpec,
} from "@workspace/core/ui";
import { workspacePath } from "@workspace/core/routing";
import {
  FINANCE_CONSOLIDATION_SCOPE_SELECTION_API_PATH,
  type ConsolidationEntityCoverage,
  type SaveFinanceConsolidationScopeSelectionInput,
} from "@workspace/finance/types";
import { useCallback, useMemo, useState } from "react";

import { createConsolidationEntityColumns } from "./consolidation-columns";
import {
  type ConsolidationTabProps,
} from "./ConsolidationTabs";
import { useConsolidationDecisionWorkspace } from "./useConsolidationDecisionWorkspace";

export function ConsolidationPreparationTab(props: ConsolidationTabProps) {
  const { data, error, loading, navigation, onRefresh } = props;
  const feedback = useFeedback();
  const [busyRelationId, setBusyRelationId] = useState<number | null>(null);
  const workspace = useConsolidationDecisionWorkspace({
    data,
    capabilities: props.capabilities,
    onRefresh,
    onBatchDeleted: props.onBatchDeleted,
  });
  const changeInclusion = useCallback(async (row: ConsolidationEntityCoverage, included: boolean) => {
    if (!data || row.relationId === null || row.relationVersion === null || included === row.isConsolidated) return;
    setBusyRelationId(row.relationId);
    try {
      if (!row.companyId || !data.scope.parentCompanyId) return;
      const command: SaveFinanceConsolidationScopeSelectionInput = {
        parentCompanyId: data.scope.parentCompanyId,
        year: data.scope.year,
        month: data.scope.month,
        periodKind: data.scope.periodKind,
        companyId: row.companyId,
        relationId: row.relationId,
        expectedRelationVersion: row.relationVersion,
        included,
      };
      const response = await fetch(workspacePath(FINANCE_CONSOLIDATION_SCOPE_SELECTION_API_PATH), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "并表范围保存失败");
      feedback.success(`${row.name}已${included ? "纳入" : "移出"}本次报表`);
      onRefresh();
    } catch (cause) {
      feedback.error(cause instanceof Error ? cause.message : "并表范围保存失败");
    } finally {
      setBusyRelationId(null);
    }
  }, [data, feedback, onRefresh]);
  const consolidationEntityColumns = useMemo(() => createConsolidationEntityColumns({
    canUpdate: props.capabilities.canUpdateConsolidationScope && !data?.batch,
    busyRelationId,
    onInclusionChange: (row, included) => void changeInclusion(row, included),
  }), [busyRelationId, changeInclusion, data?.batch, props.capabilities.canUpdateConsolidationScope]);

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
