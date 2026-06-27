"use client";

import { DataSurface } from "@workspace/core/ui";
import type { DataSurfaceColumnSpec } from "@workspace/core/ui";
import type { Contract } from "@workspace/administration/types";

interface ContractsTableProps {
  contracts: Contract[];
  visibleColumns: string[];
  onEdit: (contract: Contract) => void;
  onDelete: (id: number) => void;
}

export const CONTRACT_DEFAULT_VISIBLE_COLUMNS = ["name", "partyA", "partyB", "category", "signDate"];

function StatusBadge({ status }: { status?: string | null }) {
  const toneClass =
    status === "执行中"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : status === "已结束"
        ? "bg-slate-100 text-slate-600 ring-slate-200"
        : "bg-sky-50 text-sky-700 ring-sky-200";

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${toneClass}`}>
      {status || "-"}
    </span>
  );
}

export function getContractTableColumns(): DataSurfaceColumnSpec<Contract>[] {
  return [
    { key: "contractNo", label: "编号", cell: (c) => c.contractNo || "-" },
    { key: "name", label: "名称", defaultVisible: true, cell: (c) => <span className="font-medium text-slate-900">{c.name}</span> },
    { key: "partyA", label: "签署方", defaultVisible: true, cell: (c) => c.partyA || "-" },
    { key: "partyB", label: "签署对方", defaultVisible: true, cell: (c) => c.partyB || "-" },
    { key: "category", label: "类型", defaultVisible: true, cell: (c) => c.category || "-" },
    { key: "signDate", label: "签订日期", defaultVisible: true, cell: (c) => c.signDate || "-" },
    {
      key: "status",
      label: "状态",
      cell: (c) => <StatusBadge status={c.status} />,
    },
    {
      key: "amount",
      label: "金额",
      headerClassName: "text-right",
      cellClassName: "text-right",
      cell: (c) => c.amount != null ? c.amount.toLocaleString() : "-",
    },
    {
      key: "executedAmount",
      label: "已执行金额",
      headerClassName: "text-right",
      cellClassName: "text-right",
      cell: (c) => c.executedAmount != null ? c.executedAmount.toLocaleString() : "-",
    },
    { key: "handler", label: "经办人", cell: (c) => c.handler || "-" },
    { key: "location", label: "位置", cell: (c) => c.location || "-" },
  ];
}

export default function ContractsTable({ contracts, visibleColumns, onEdit, onDelete }: ContractsTableProps) {
  const columns = getContractTableColumns();

  return (
    <DataSurface<Contract>
      kind="table"
      framed
      className="overflow-hidden"
      bodyClassName="overflow-x-auto"
      rows={contracts}
      columns={columns}
      visibleColumns={visibleColumns}
      rowKey={(contract) => contract.id}
      emptyText="暂无数据"
        rowActions={(c) => [
          { key: "edit", label: "编辑", kind: "edit", onClick: () => onEdit(c) },
          { key: "delete", label: "删除", kind: "delete", onClick: () => onDelete(c.id) },
      ]}
      actionsColumn={{ centered: true }}
    />
  );
}
