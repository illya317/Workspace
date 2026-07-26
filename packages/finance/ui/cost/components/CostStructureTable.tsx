"use client";

import { useState } from "react";
import { type DataSurfaceColumnSpec } from "@workspace/core/ui";
import type { BodySurfaceModalSpec, BodySurfaceSectionSpec, PageSurfaceFooterSpec } from "@workspace/core/ui";
import { useCostData } from "../hooks/useFinanceCostData";
import type { CostFiltersState, SourceTraceInfo } from "../types";
import { createCostDataSurface, createCostTraceAction, formatCostNumber, type CostRecord } from "./CostDataTable";
import { createSourceTraceModal } from "./SourceTraceModal";

export function useCostStructureSurface(filters: CostFiltersState): {
  sections: BodySurfaceSectionSpec[];
  footer?: PageSurfaceFooterSpec;
  modals: BodySurfaceModalSpec[];
} {
  const [page, setPage] = useState(1);
  const [trace, setTrace] = useState<{ open: boolean; info: SourceTraceInfo | null }>({ open: false, info: null });
  const { data, pagination, loading, error } = useCostData<CostRecord>({
    endpoint: "cost-structure",
    filters,
    page,
    pageSize: 50,
  });

  const columns: DataSurfaceColumnSpec<CostRecord>[] = [
    { key: "period", label: "年月", required: true, width: "sm", cell: (row) => `${String(row.year)}-${row.month != null ? String(row.month) : "—"}` },
    { key: "productStatus", label: "产品状态", required: true, width: "sm", cell: (row) => String(row.productStatus ?? "—") },
    { key: "productName", label: "名称", required: true, width: "sm", cell: (row) => String(row.productName ?? "—") },
    { key: "productMasterStatus", label: "产品主数据", required: true, width: "sm", cell: (row) => row.productMasterStatus === "linked" ? "已关联" : "待关联" },
    { key: "receiptReportStatus", label: "入库报单", required: true, width: "sm", cell: (row) => row.receiptReportStatus === "approved" ? "已复核" : row.receiptReportStatus === "submitted" ? "已确认" : row.receiptReportStatus === "draft" ? "草稿" : "未关联" },
    { key: "workHours", label: "工时", required: true, numeric: true, width: "sm", cell: (row) => formatCostNumber(row.workHours as number) },
    { key: "rawMaterials", label: "原材料", required: true, numeric: true, width: "sm", cell: (row) => formatCostNumber(row.rawMaterials as number) },
    { key: "packagingMaterials", label: "包装材料", required: true, numeric: true, width: "sm", cell: (row) => formatCostNumber(row.packagingMaterials as number) },
    { key: "directLaborWage", label: "工资", required: true, numeric: true, width: "sm", cell: (row) => formatCostNumber(row.directLaborWage as number) },
    { key: "directLaborSocialSecurity", label: "直接人工-五险一金", required: true, numeric: true, width: "md", cell: (row) => formatCostNumber(row.directLaborSocialSecurity as number) },
    { key: "directLaborWelfare", label: "直接人工-福利", required: true, numeric: true, width: "md", cell: (row) => formatCostNumber(row.directLaborWelfare as number) },
    { key: "auxiliaryLaborWage", label: "辅助人工-工资", required: true, numeric: true, width: "md", cell: (row) => formatCostNumber(row.auxiliaryLaborWage as number) },
    { key: "auxiliaryLaborSocialSecurity", label: "辅助人工-五险一金", required: true, numeric: true, width: "md", cell: (row) => formatCostNumber(row.auxiliaryLaborSocialSecurity as number) },
    { key: "auxiliaryLaborWelfare", label: "辅助人工-福利", required: true, numeric: true, width: "md", cell: (row) => formatCostNumber(row.auxiliaryLaborWelfare as number) },
    { key: "utilities", label: "水电燃气费", required: true, numeric: true, width: "sm", cell: (row) => formatCostNumber(row.utilities as number) },
    { key: "depreciationDirect", label: "折旧-直接", required: true, numeric: true, width: "sm", cell: (row) => formatCostNumber(row.depreciationDirect as number) },
    { key: "depreciationAuxiliary", label: "折旧-辅助", required: true, numeric: true, width: "sm", cell: (row) => formatCostNumber(row.depreciationAuxiliary as number) },
    { key: "otherManufacturingCost", label: "其它", required: true, numeric: true, width: "sm", cell: (row) => formatCostNumber(row.otherManufacturingCost as number) },
    { key: "manufacturingSubtotal", label: "制造费用小计", required: true, numeric: true, width: "md", emphasis: "medium", cell: (row) => formatCostNumber(row.manufacturingSubtotal as number) },
    { key: "quantity", label: "入库数量", required: true, numeric: true, width: "sm", cell: (row) => formatCostNumber(row.quantity as number) },
    { key: "unitCost", label: "成本单价", required: true, numeric: true, width: "sm", emphasis: "medium", cell: (row) => row.unitCost == null ? "—" : Number(row.unitCost).toLocaleString("zh-CN", { minimumFractionDigits: 4, maximumFractionDigits: 4 }) },
  ];

  const table = createCostDataSurface({
    rows: data,
    columns,
    loading,
    error,
    pagination,
    page,
    onPageChange: setPage,
    format: {
      kind: "matrix",
      rowHeaderWidth: "7rem",
      columnWidths: [
        "7rem", "7rem", "8rem", "7rem", "7rem", "7rem", "8rem", "8rem", "8rem",
        "10rem", "9rem", "9rem", "10rem", "9rem", "8rem", "8rem",
        "8rem", "8rem", "9rem", "8rem", "8rem",
      ],
    },
    mobile: { presentation: "landscape" },
    presentation: { density: "compact", grid: "cells", cellWrap: "nowrap" },
    rowActions: (row) => [createCostTraceAction({ row, onTrace: (info) => setTrace({ open: true, info }) })],
  });
  const modal = createSourceTraceModal({ open: trace.open, info: trace.info, onClose: () => setTrace({ ...trace, open: false }) });
  return {
    sections: table.sections,
    footer: table.footer,
    modals: modal ? [modal] : [],
  };
}
