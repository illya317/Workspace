"use client";

import { DataTable, StatusBadge, type DataTableColumn } from "@workspace/core/ui";
import type { Contract } from "@workspace/administration/types";

interface ContractsTableProps {
  contracts: Contract[];
  onEdit: (contract: Contract) => void;
  onDelete: (id: number) => void;
}

export default function ContractsTable({ contracts, onEdit, onDelete }: ContractsTableProps) {
  const columns: DataTableColumn<Contract>[] = [
    { key: "contractNo", label: "编号", defaultVisible: true, render: (c) => c.contractNo || "-" },
    { key: "name", label: "名称", required: true, render: (c) => <span className="font-medium text-gray-900">{c.name}</span> },
    { key: "partyA", label: "签署方", defaultVisible: true, render: (c) => c.partyA || "-" },
    { key: "partyB", label: "签署对方", defaultVisible: true, render: (c) => c.partyB || "-" },
    { key: "category", label: "类型", defaultVisible: true, render: (c) => c.category || "-" },
    { key: "signDate", label: "签订日期", defaultVisible: true, render: (c) => c.signDate || "-" },
    {
      key: "status",
      label: "状态",
      defaultVisible: true,
      render: (c) => <StatusBadge label={c.status || "-"} variant={c.status === "执行中" ? "green" : c.status === "已结束" ? "gray" : "blue"} />,
    },
    {
      key: "amount",
      label: "金额",
      defaultVisible: true,
      headerClassName: "text-right",
      cellClassName: "text-right",
      render: (c) => c.amount != null ? c.amount.toLocaleString() : "-",
    },
    { key: "location", label: "位置", defaultVisible: true, render: (c) => c.location || "-" },
    {
      key: "actions",
      label: "操作",
      required: true,
      headerClassName: "text-center",
      cellClassName: "text-center",
      render: (c) => (
        <>
          <button onClick={() => onEdit(c)} className="mr-2 text-xs text-emerald-600 hover:underline">编辑</button>
          <button onClick={() => onDelete(c.id)} className="text-xs text-red-500 hover:underline">删除</button>
        </>
      ),
    },
  ];

  return (
    <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
      <DataTable
        rows={contracts}
        columns={columns}
        visibleColumns={columns.map((column) => column.key)}
        rowKey={(contract) => contract.id}
        emptyText="暂无数据"
      />
    </div>
  );
}
