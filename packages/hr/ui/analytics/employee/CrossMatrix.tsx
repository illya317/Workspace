"use client";

import { AnalysisBlock, DataTable, type DataTableColumn } from "@workspace/core/ui";
import type { CrossMatrixData } from "./useEmployeeData";
import { DIM_LABELS, type DimKey } from "./constants";

interface CrossMatrixRow {
  rowKey: string;
  values: Record<string, number>;
  total: number;
}

function heatColor(v: number, max: number): string {
  if (max === 0) return "bg-gray-50";
  const ratio = v / max;
  if (ratio === 0) return "bg-gray-50";
  if (ratio < 0.15) return "bg-blue-100";
  if (ratio < 0.3) return "bg-blue-200";
  if (ratio < 0.5) return "bg-blue-300";
  if (ratio < 0.7) return "bg-blue-400 text-white";
  return "bg-blue-600 text-white";
}

export default function CrossMatrix({
  crossMatrix,
  crossRow,
  crossCol,
  statsActive,
  featureList,
  setCrossRow,
  setCrossCol,
}: {
  crossMatrix: CrossMatrixData;
  crossRow: DimKey;
  crossCol: DimKey;
  statsActive: number;
  featureList: DimKey[];
  setCrossRow: (v: DimKey) => void;
  setCrossCol: (v: DimKey) => void;
}) {
  const crossMax = Math.max(0, ...Object.values(crossMatrix.rowTotals));
  const rowOptions = featureList
    .filter((feature) => feature !== crossCol)
    .map((feature) => ({ value: feature, label: DIM_LABELS[feature] }));
  const colOptions = featureList
    .filter((feature) => feature !== crossRow)
    .map((feature) => ({ value: feature, label: DIM_LABELS[feature] }));
  const rows: CrossMatrixRow[] = crossMatrix.rowKeys.map((rowKey) => ({
    rowKey,
    values: crossMatrix.matrix[rowKey] || {},
    total: crossMatrix.rowTotals[rowKey] || 0,
  }));
  const columns: DataTableColumn<CrossMatrixRow>[] = [
    {
      key: "rowKey",
      label: `${DIM_LABELS[crossRow]} \\ ${DIM_LABELS[crossCol]}`,
      required: true,
      cellClassName: "font-medium text-slate-800",
      render: (row) => row.rowKey,
    },
    ...crossMatrix.colKeys.map((colKey): DataTableColumn<CrossMatrixRow> => ({
      key: `col:${colKey}`,
      label: colKey,
      required: true,
      headerClassName: "text-center",
      cellClassName: "text-center",
      render: (row) => {
        const value = row.values[colKey] || 0;
        return (
          <span className={`block rounded px-2 py-1 ${heatColor(value, crossMax)}`}>
            {value > 0 ? value : "—"}
          </span>
        );
      },
    })),
    {
      key: "total",
      label: "合计",
      required: true,
      headerClassName: "text-center",
      cellClassName: "text-center font-medium text-slate-800",
      render: (row) => row.total,
    },
  ];

  return (
    <AnalysisBlock
      title="交叉分析"
      toolbarItems={[
        { kind: "select", key: "row", label: "行", value: crossRow, onChange: (value) => setCrossRow(value as DimKey), options: rowOptions, triggerClassName: "!min-h-7 !w-28" },
        { kind: "text", key: "by", content: <span className="text-gray-300">&times;</span> },
        { kind: "select", key: "column", label: "列", value: crossCol, onChange: (value) => setCrossCol(value as DimKey), options: colOptions, triggerClassName: "!min-h-7 !w-28" },
        { kind: "text", key: "meta", content: <>共 {statsActive} 人</> },
      ]}
    >

      {crossMatrix.rowKeys.length === 0 ? (
        <p className="text-xs text-gray-400 py-4">无数据</p>
      ) : (
        <DataTable
          rows={[...rows, { rowKey: "合计", values: crossMatrix.colTotals, total: statsActive }]}
          columns={columns}
          visibleColumns={columns.map((column) => column.key)}
          rowKey={(row) => row.rowKey}
          rowClassName={(row) => row.rowKey === "合计" ? "bg-slate-50 font-medium" : ""}
        />
      )}
    </AnalysisBlock>
  );
}
