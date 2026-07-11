"use client";

import type { DataSurfaceColumnSpec } from "@workspace/core/ui";
import type { Contract } from "@workspace/administration/types";

export { CONTRACT_DEFAULT_VISIBLE_COLUMNS } from "./contract-table-config";

export function getContractTableColumns(): DataSurfaceColumnSpec<Contract>[] {
  return [
    { key: "contractNo", label: "编号", cell: (c) => c.contractNo || "-" },
    { key: "name", label: "名称", defaultVisible: true, cell: (c) => ({ kind: "text", value: c.name, emphasis: "medium" }) },
    { key: "partyA", label: "签署方", defaultVisible: true, cell: (c) => c.partyA || "-" },
    { key: "partyB", label: "签署对方", defaultVisible: true, cell: (c) => c.partyB || "-" },
    { key: "category", label: "类型", defaultVisible: true, cell: (c) => c.category || "-" },
    { key: "signDate", label: "签订日期", defaultVisible: true, cell: (c) => c.signDate || "-" },
    {
      key: "status",
      label: "状态",
      cell: (c) => ({
        kind: "badge",
        label: c.status || "-",
        tone: c.status === "执行中" ? "green" : c.status === "已结束" ? "slate" : "sky",
      }),
    },
    {
      key: "amount",
      label: "金额",
      align: "right",

      cell: (c) => c.amount != null ? c.amount.toLocaleString() : "-",
    },
    {
      key: "executedAmount",
      label: "已执行金额",
      align: "right",

      cell: (c) => c.executedAmount != null ? c.executedAmount.toLocaleString() : "-",
    },
    { key: "handler", label: "经办人", cell: (c) => c.handler || "-" },
    { key: "location", label: "位置", cell: (c) => c.location || "-" },
  ];
}
