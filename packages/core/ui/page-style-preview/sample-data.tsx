import type { ReactNode } from "react";
import DataTable, { type DataTableColumn } from "../internal/data/DataTable";
import Badge from "../internal/common/Badge";
import { type PreviewRow, usePageStylePreviewSamples } from "./sample-context";

function getPreviewColumns(): DataTableColumn<PreviewRow>[] {
  return [
    { key: "code", label: "编码", required: true, render: (row) => row.code },
    { key: "name", label: "名称", required: true, render: (row) => <strong>{row.name}</strong> },
    { key: "owner", label: "负责人", defaultVisible: true, render: (row) => row.owner },
    { key: "type", label: "类型", defaultVisible: true, render: (row) => row.type },
    { key: "scope", label: "范围", defaultVisible: true, render: (row) => row.scope },
    {
      key: "status",
      label: "状态",
      defaultVisible: true,
      render: (row) => <Badge label={row.status} tone={row.status === "归档" ? "gray" : "green"} />,
    },
    { key: "updated", label: "更新时间", defaultVisible: true, render: (row) => row.updated },
  ];
}

const columnValueByLabel: Record<string, (row: PreviewRow) => ReactNode> = {
  编码: (row) => row.code,
  名称: (row) => <strong>{row.name}</strong>,
  负责人: (row) => row.owner,
  类型: (row) => row.type,
  范围: (row) => row.scope,
  状态: (row) => <Badge label={row.status} tone={row.status === "归档" ? "gray" : "green"} />,
  更新时间: (row) => row.updated,
};

function resolveColumnValue(label: string, row: PreviewRow, index: number) {
  const explicit = columnValueByLabel[label];
  if (explicit) return explicit(row);
  if (label.includes("状态")) return <Badge label={row.status} tone={row.status === "归档" ? "gray" : "green"} />;
  if (label.includes("日期") || label.includes("时间") || label.includes("到期")) return row.updated;
  if (label.includes("金额") || label.includes("额度") || label.includes("余额") || label.includes("差额")) return "12,800";
  if (label.includes("编码") || label.includes("编号") || label.includes("批号")) return row.code;
  if (label.includes("人") || label.includes("方")) return row.owner;
  if (index === 0) return <strong>{row.name}</strong>;
  return [row.type, row.scope, row.owner][index % 3];
}

function buildPreviewColumns(labels?: string[]) {
  if (!labels?.length) return getPreviewColumns();
  return labels.map<DataTableColumn<PreviewRow>>((label, index) => ({
    key: `field-${index}`,
    label,
    required: true,
    render: (row) => resolveColumnValue(label, row, index),
  }));
}

export function PreviewTable({ columns, children }: { columns?: string[]; children?: ReactNode }) {
  const { previewRows } = usePageStylePreviewSamples();
  const tableColumns = buildPreviewColumns(columns);
  const visibleColumns = tableColumns.map((column) => column.key);

  return (
    <>
      {children}
      <DataTable
        rows={previewRows}
        columns={tableColumns}
        visibleColumns={visibleColumns}
        rowKey={(row) => row.id}
        density="compact"
      />
    </>
  );
}
