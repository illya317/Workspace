"use client";

import {
  DataTable,
  PanelCard,
  Pagination,
  TableScrollFrame,
  type DataTableColumn,
} from "@workspace/core/ui";
import type { QcBatchSummary } from "@workspace/production/server/qc";

export interface QcBatchTableRow extends QcBatchSummary {
  inspectorNames: string[];
  reviewerNames: string[];
  statusLabels: string[];
}

export function qcBatchStatusText(batch: Pick<QcBatchTableRow, "statusLabels">) {
  return batch.statusLabels.length ? batch.statusLabels.join(" / ") : "检验中";
}

export function formatQcBatchDate(value: string) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-") : "-";
}

const batchColumns: DataTableColumn<QcBatchTableRow>[] = [
  { key: "id", label: "ID", required: true, render: (batch) => <span className="text-slate-700">{batch.id}</span> },
  { key: "batchNumber", label: "批号", required: true, render: (batch) => <span className="text-slate-700">{batch.batchNumber}</span> },
  { key: "productName", label: "产品", required: true, render: (batch) => <span className="text-slate-700">{batch.productName}</span> },
  { key: "inspectors", label: "检验者", required: true, render: (batch) => <span className="text-slate-700">{batch.inspectorNames.join("、") || "-"}</span> },
  { key: "reviewers", label: "复核者", required: true, render: (batch) => <span className="text-slate-700">{batch.reviewerNames.join("、") || "-"}</span> },
  { key: "status", label: "状态", required: true, render: (batch) => <span className="text-slate-700">{qcBatchStatusText(batch)}</span> },
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
  rows: QcBatchTableRow[];
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  onView: (batch: QcBatchTableRow) => void;
  onDelete: (batch: QcBatchTableRow) => void;
}) {
  return (
    <PanelCard title="批次记录">
      <TableScrollFrame>
        <DataTable
          rows={rows}
          columns={batchColumns}
          rowActions={(batch) => [
            { key: "view", label: "查看检验记录", kind: "view", onClick: () => onView(batch) },
            { key: "delete", label: "删除", kind: "delete", onClick: () => onDelete(batch) },
          ]}
          rowKey={(batch) => batch.id}
          emptyText="暂无批次记录。"
          tableClassName="min-w-[920px]"
        />
        <Pagination page={page} totalPages={totalPages} total={total} onPageChange={onPageChange} className="border-t border-slate-100" compact />
      </TableScrollFrame>
    </PanelCard>
  );
}
