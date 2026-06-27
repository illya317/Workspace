"use client";

import { PageSurface } from "@workspace/core/ui";
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
    <PageSurface
      kind="list"
      embedded
      body={{
        layout: "single",
        blocks: [{
          kind: "data",
          key: "qc-batches",
          surface: {
            kind: "table",
            framed: true,
            title: "批次记录",
            rows,
            columns: [
              { key: "id", label: "ID", required: true, cell: (batch) => ({ kind: "text", value: batch.id, className: "text-slate-700" }) },
              { key: "batchNumber", label: "批号", required: true, cell: (batch) => ({ kind: "text", value: batch.batchNumber, className: "text-slate-700" }) },
              { key: "productName", label: "产品", required: true, cell: (batch) => ({ kind: "text", value: batch.productName, className: "text-slate-700" }) },
              { key: "inspectors", label: "检验者", required: true, cell: (batch) => ({ kind: "text", value: batch.inspectorNames.join("、") || "-", className: "text-slate-700" }) },
              { key: "reviewers", label: "复核者", required: true, cell: (batch) => ({ kind: "text", value: batch.reviewerNames.join("、") || "-", className: "text-slate-700" }) },
              { key: "status", label: "状态", required: true, cell: (batch) => ({ kind: "text", value: qcBatchStatusText(batch), className: "text-slate-700" }) },
              { key: "createdAt", label: "创建时间", required: true, cell: (batch) => ({ kind: "text", value: formatQcBatchDate(batch.createdAt), className: "text-slate-500" }) },
            ],
            rowActions: (batch) => [
              { key: "view", label: "查看检验记录", kind: "view", onClick: () => onView(batch) },
              { key: "delete", label: "删除", kind: "delete", onClick: () => onDelete(batch) },
            ],
            rowKey: (batch) => batch.id,
            emptyText: "暂无批次记录。",
            tableClassName: "min-w-[920px]",
          },
        }],
      }}
      footer={{ pagination: { page, totalPages, total, onPageChange, className: "border-t border-slate-100", compact: true } }}
    />
  );
}
