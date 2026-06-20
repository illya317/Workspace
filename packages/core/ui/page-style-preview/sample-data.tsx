import type { ReactNode } from "react";
import DataTable, { type DataTableColumn } from "../DataTable";
import StatusBadge from "../StatusBadge";

export type PreviewRow = {
  id: string;
  code: string;
  name: string;
  owner: string;
  type: string;
  scope: string;
  status: string;
  updated: string;
};

export const previewRows: PreviewRow[] = [
  { id: "1", code: "A001", name: "月度主数据", owner: "张明", type: "标准", scope: "内部", status: "现用", updated: "06-18" },
  { id: "2", code: "A018", name: "季度核对", owner: "李青", type: "复核", scope: "公开", status: "待确认", updated: "06-12" },
  { id: "3", code: "A092", name: "归档样本", owner: "王岚", type: "历史", scope: "内部", status: "归档", updated: "05-30" },
];

export const previewColumns: DataTableColumn<PreviewRow>[] = [
  { key: "code", label: "编码", required: true, render: (row) => row.code },
  { key: "name", label: "名称", required: true, render: (row) => <strong>{row.name}</strong> },
  { key: "owner", label: "负责人", defaultVisible: true, render: (row) => row.owner },
  { key: "type", label: "类型", defaultVisible: true, render: (row) => row.type },
  { key: "scope", label: "范围", defaultVisible: true, render: (row) => row.scope },
  {
    key: "status",
    label: "状态",
    defaultVisible: true,
    render: (row) => <StatusBadge label={row.status} variant={row.status === "归档" ? "gray" : "green"} />,
  },
  { key: "updated", label: "更新时间", defaultVisible: true, render: (row) => row.updated },
];

export function PreviewTable({ children }: { children?: ReactNode }) {
  return (
    <>
      {children}
      <DataTable
        rows={previewRows}
        columns={previewColumns}
        visibleColumns={["owner", "type", "scope", "status", "updated"]}
        rowKey={(row) => row.id}
        density="compact"
      />
    </>
  );
}
