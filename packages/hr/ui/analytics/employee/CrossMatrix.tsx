"use client";

import { createPageBody, createAnalysisSection, createInlineFieldsSection, createMessageSection, PageSurface, type DataSurfaceColumnSpec, type BodySurfaceSectionSpec } from "@workspace/core/ui";
import type { CrossMatrixData } from "./useEmployeeData";
import { DIM_LABELS, type DimKey } from "./constants";

interface CrossMatrixRow {
  rowKey: string;
  values: Record<string, number>;
  total: number;
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
  const section = createCrossMatrixSection({
    crossMatrix,
    crossRow,
    crossCol,
    statsActive,
    featureList,
    setCrossRow,
    setCrossCol,
  });

  return (
    <PageSurface kind="standard"
      body={createPageBody([section])}
    />
  );
}

export function createCrossMatrixSection({
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
}): BodySurfaceSectionSpec {
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
  const columns: DataSurfaceColumnSpec<CrossMatrixRow>[] = [
    {
      key: "rowKey",
      label: `${DIM_LABELS[crossRow]} \\ ${DIM_LABELS[crossCol]}`,
      required: true,
      emphasis: "medium",
      cell: (row) => row.rowKey,
    },
    ...crossMatrix.colKeys.map((colKey): DataSurfaceColumnSpec<CrossMatrixRow> => ({
      key: `col:${colKey}`,
      label: colKey,
      required: true,
      align: "center",

      cell: (row) => {
        const value = row.values[colKey] || 0;
        const ratio = crossMax > 0 ? value / crossMax : 0;
        return { kind: "badge", label: value > 0 ? value : "—", tone: ratio >= 0.75 ? "blue" : ratio >= 0.4 ? "sky" : ratio > 0 ? "slate" : "gray" };
      },
    })),
    {
      key: "total",
      label: "合计",
      required: true,
      align: "center",
       emphasis: "medium",
      cell: (row) => row.total,
    },
  ];
  const matrixTableSection: BodySurfaceSectionSpec = {
    key: "matrix-table",
    body: { kind: "data", data: {
      kind: "table",
      rows: [...rows, { rowKey: "合计", values: crossMatrix.colTotals, total: statsActive }],
      columns,
      visibleColumns: columns.map((column) => column.key),
      rowKey: (row: CrossMatrixRow) => row.rowKey,
      rowState: (row: CrossMatrixRow) => row.rowKey === "合计" ? "total" : "normal",
    } },
  };

  return createAnalysisSection("cross-matrix", {
    title: "交叉分析",
    sections: [
      createInlineFieldsSection("cross-matrix-filters", [
        { key: "row", label: "行", spec: { valueType: "string", control: "choice", options: { source: "static", items: rowOptions } }, value: crossRow, onChange: (value) => setCrossRow(value as DimKey) },
        { key: "column", label: "列", spec: { valueType: "string", control: "choice", options: { source: "static", items: colOptions } }, value: crossCol, onChange: (value) => setCrossCol(value as DimKey) },
        { kind: "readonly", key: "meta", label: "统计", value: <>共 {statsActive} 人</>, variant: "plain" },
      ]),
      ...(crossMatrix.rowKeys.length === 0
      ? [createMessageSection("empty", {
        tone: "muted",
        content: "无数据"
      })]
      : [matrixTableSection]),
    ],
  });
}
