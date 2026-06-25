"use client";

import { workspacePath } from "@workspace/core/routing";
import { useState } from "react";
import { type DataTableColumn, getToolbarActionClassName } from "@workspace/core/ui";
import { useConfirmDelete } from "@workspace/core/ui/ConfirmProvider";
import { useCostData } from "../hooks/useFinanceCostData";
import type { CostFiltersState } from "../types";
import CostDataTable, { type CostRecord } from "./CostDataTable";
interface Props {
  filters: CostFiltersState;
}
export default function ImportHistoryTable({
  filters
}: Props) {
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const confirmDelete = useConfirmDelete();
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
    const ok = await confirmDelete({
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
  const columns: DataTableColumn<CostRecord>[] = [{
    key: "id",
    label: "ID",
    required: true,
    render: row => String(row.id)
  }, {
    key: "profile",
    label: "类型",
    required: true,
    render: row => String(row.profile)
  }, {
    key: "year",
    label: "年份",
    required: true,
    render: row => row.year ? String(row.year) : "—"
  }, {
    key: "sourceFile",
    label: "源文件",
    required: true,
    render: row => String(row.sourceFile)
  }, {
    key: "recordCount",
    label: "记录数",
    required: true,
    className: "text-right",
    headerClassName: "text-right",
    render: row => String(row.recordCount)
  }, {
    key: "warningCount",
    label: "警告",
    required: true,
    className: "text-right",
    headerClassName: "text-right",
    render: row => String(row.warningCount)
  }, {
    key: "importedAt",
    label: "导入时间",
    required: true,
    render: row => row.importedAt ? new Date(String(row.importedAt)).toLocaleString("zh-CN") : "—"
  }, {
    key: "actions",
    label: "操作",
    required: true,
    render: row => <button type="button" disabled={deleting === row.id} onClick={() => handleDelete(Number(row.id))} className={[getToolbarActionClassName("danger"), "border-0 bg-transparent p-0 text-xs shadow-none hover:bg-transparent hover:underline"].filter(Boolean).join(" ")}>
          {deleting === row.id ? "删除中…" : "删除"}
        </button>
  }];
  return <div className="space-y-4">
      {localError && <p className="text-sm text-red-500">{localError}</p>}
      <CostDataTable rows={data} columns={columns} loading={loading} error={error} pagination={pagination} page={page} onPageChange={setPage} />
    </div>;
}
