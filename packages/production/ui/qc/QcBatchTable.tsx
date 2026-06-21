"use client";

import {
  DataTable,
  DataTableActionsCell,
  PanelCard,
  Pagination,
  TableScrollFrame,
  type DataTableColumn,
} from "@workspace/core/ui";
import type { QcBatchSummary } from "@workspace/production/server/qc";

export function qcBatchStatusLabel(status: QcBatchSummary["status"]) {
  return status === "submitted" ? "已提交" : "待检";
}

export function formatQcBatchDate(value: string) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-") : "-";
}

const batchColumns: DataTableColumn<QcBatchSummary>[] = [
  { key: "id", label: "ID", required: true, render: (batch) => <span className="text-slate-700">{batch.id}</span> },
  { key: "batchNumber", label: "批号", required: true, render: (batch) => <span className="text-slate-700">{batch.batchNumber}</span> },
  { key: "productName", label: "产品", required: true, render: (batch) => <span className="text-slate-700">{batch.productName}</span> },
  { key: "inspector", label: "检验者", required: true, render: (batch) => <span className="text-slate-700">{batch.inspector || "-"}</span> },
  { key: "status", label: "状态", required: true, render: (batch) => <span className="text-slate-700">{qcBatchStatusLabel(batch.status)}</span> },
  { key: "createdAt", label: "创建时间", required: true, render: (batch) => <span className="text-slate-500">{formatQcBatchDate(batch.createdAt)}</span> },
];

export function QcBatchTable({
  rows,
  page,
  totalPages,
  total,
  onPageChange,
  onView,
  onDelete,
}: {
  rows: QcBatchSummary[];
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  onView: (batch: QcBatchSummary) => void;
  onDelete: (batch: QcBatchSummary) => void;
}) {
  return (
    <PanelCard title="批次记录">
      <TableScrollFrame>
        <DataTable
          rows={rows}
          columns={[
            ...batchColumns,
            {
              key: "actions",
              label: "操作",
              required: true,
              render: (batch) => (
                <DataTableActionsCell
                  actions={[
                    { key: "view", label: "查看检验记录", kind: "view", onClick: () => onView(batch) },
                    { key: "delete", label: "删除", kind: "delete", onClick: () => onDelete(batch) },
                  ]}
                />
              ),
            },
          ]}
          visibleColumns={batchColumns.map((column) => column.key).concat("actions")}
          rowKey={(batch) => batch.id}
          emptyText="暂无批次记录。"
          tableClassName="min-w-[820px]"
        />
        <Pagination page={page} totalPages={totalPages} total={total} onPageChange={onPageChange} className="border-t border-slate-100" compact />
      </TableScrollFrame>
    </PanelCard>
  );
}
