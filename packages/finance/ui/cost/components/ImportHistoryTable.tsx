"use client";

import { workspacePath } from "@workspace/core/routing";
import { useState } from "react";
import { BodySurface, createMessageSection, createPageBody, PageSurface, useFeedback, type DataSurfaceColumnSpec } from "@workspace/core/ui";
import type { BodySurfaceSectionSpec, PageSurfaceFooterSpec } from "@workspace/core/ui";
import { useCostData } from "../hooks/useFinanceCostData";
import type { CostFiltersState } from "../types";
import { createCostDataSurface, type CostRecord } from "./CostDataTable";
interface Props {
  filters: CostFiltersState;
  canDelete: boolean;
}
export default function ImportHistoryTable({
  filters,
  canDelete,
}: Props) {
  const surface = useImportHistorySurface(filters, { canDelete });
  return <PageSurface kind="standard" embedded body={createPageBody(surface.sections)} footer={surface.footer} />;
}

export function useImportHistorySurface(filters: CostFiltersState, options: { canDelete: boolean }): {
  sections: BodySurfaceSectionSpec[];
  footer?: PageSurfaceFooterSpec;
} {
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const feedback = useFeedback();
  const {
    data,
    pagination,
    loading,
    error,
    refetch
  } = useCostData<CostRecord>({
    endpoint: "imports",
    filters,
    page,
    pageSize: 20
  });
  const handleDelete = async (id: number) => {
    const ok = await feedback.confirmDelete({
      message: "确定删除该导入批次？关联数据将被一并删除。"
    });
    if (!ok) return;
    setDeleting(id);
    setLocalError(null);
    try {
      const res = await fetch(workspacePath(`/api/modules/finance/cost/imports/${id}`), {
        method: "DELETE"
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setLocalError(json.error || "删除失败");
      } else {
        refetch();
      }
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeleting(null);
    }
  };
  const columns: DataSurfaceColumnSpec<CostRecord>[] = [{
    key: "id",
    label: "ID",
    required: true,
    cell: row => String(row.id)
  }, {
    key: "profile",
    label: "类型",
    required: true,
    cell: row => String(row.profile)
  }, {
    key: "year",
    label: "年份",
    required: true,
    cell: row => row.year ? String(row.year) : "—"
  }, {
    key: "sourceFile",
    label: "源文件",
    required: true,
    cell: row => String(row.sourceFile)
  }, {
    key: "recordCount",
    label: "记录数",
    required: true,
    align: "right",

    cell: row => String(row.recordCount)
  }, {
    key: "warningCount",
    label: "警告",
    required: true,
    align: "right",

    cell: row => String(row.warningCount)
  }, {
    key: "importedAt",
    label: "导入时间",
    required: true,
    cell: row => row.importedAt ? new Date(String(row.importedAt)).toLocaleString("zh-CN") : "—"
  }, ...(options.canDelete ? [{
    key: "actions",
    label: "操作",
    required: true,
    cell: row => (
      <span className="inline-flex" onClick={(event) => event.stopPropagation()}>
        <BodySurface
          kind="section"
          commands={[{
            key: `delete-${String(row.id)}`,
            label: deleting === row.id ? "删除中…" : "删除",
            icon: "delete-bin",
            variant: "danger",
            size: "sm",
            disabled: deleting === row.id,
            onClick: () => handleDelete(Number(row.id)),
            presentation: "icon",
          }]}
        />
      </span>
    )
  } satisfies DataSurfaceColumnSpec<CostRecord>] : [])];
  const table = createCostDataSurface({ rows: data, columns, loading, error, pagination, page, onPageChange: setPage });
  return {
    sections: [
      ...(localError ? [createMessageSection("delete-error", { content: localError, tone: "danger" })] : []),
      ...table.sections,
    ],
    footer: table.footer,
  };
}
