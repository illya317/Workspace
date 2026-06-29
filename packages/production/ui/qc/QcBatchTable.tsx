"use client";

import { PageSurface, createPageBody } from "@workspace/core/ui";
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
    <PageSurface kind="standard"
      embedded
      body={createPageBody([{
          key: "qc-batches",
          body: { kind: "data", data: {
            kind: "table",
            rows,
            columns: [
              { key: "id", label: "ID", required: true, cell: (batch) => ({ kind: "text", value: batch.id,  }) },
              { key: "batchNumber", label: "批号", required: true, cell: (batch) => ({ kind: "text", value: batch.batchNumber,  }) },
              { key: "productName", label: "产品", required: true, cell: (batch) => ({ kind: "text", value: batch.productName,  }) },
              { key: "inspectors", label: "检验者", required: true, cell: (batch) => ({ kind: "text", value: batch.inspectorNames.join("、") || "-",  }) },
              { key: "reviewers", label: "复核者", required: true, cell: (batch) => ({ kind: "text", value: batch.reviewerNames.join("、") || "-",  }) },
              { key: "status", label: "状态", required: true, cell: (batch) => ({ kind: "text", value: qcBatchStatusText(batch),  }) },
              { key: "createdAt", label: "创建时间", required: true, cell: (batch) => ({ kind: "text", value: formatQcBatchDate(batch.createdAt), tone: "muted", }) },
            ],
            rowActions: (batch) => [
              { key: "view", label: "查看检验记录", kind: "view", onClick: () => onView(batch) },
              { key: "delete", label: "删除", kind: "delete", onClick: () => onDelete(batch) },
            ],
            rowKey: (batch) => batch.id,
            emptyText: "暂无批次记录。",
            scroll: { x: true },
          } },
        }], { layout: "single" })}
      footer={{ pagination: { page, totalPages, total, onPageChange,  compact: true } }}
    />
  );
}
