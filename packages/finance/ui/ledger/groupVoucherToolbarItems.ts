import type { SurfaceToolbarItem } from "@workspace/core/ui";
import type {
  FinanceGroupVoucherDocumentType,
  FinanceLedgerExportMode,
  FinanceVoucherPeriodScope,
} from "@workspace/finance/types";

import { GROUP_VOUCHER_DOCUMENT_TYPE_OPTIONS } from "./groupVoucherDocumentTypes";

/** @ui-structural-declaration 合并明细低频筛选的声明式 Toolbar 结构。 */
export function groupVoucherFilterPanelItem({
  documentType,
  origin,
  exportMode,
  periodScope,
  onDocumentTypeChange,
  onOriginChange,
  onExportModeChange,
  onPeriodScopeChange,
  onReset,
}: {
  documentType: "" | FinanceGroupVoucherDocumentType;
  origin: "" | "manual" | "system";
  exportMode: FinanceLedgerExportMode;
  periodScope: FinanceVoucherPeriodScope;
  onDocumentTypeChange: (value: "" | FinanceGroupVoucherDocumentType) => void;
  onOriginChange: (value: "" | "manual" | "system") => void;
  onExportModeChange: (value: FinanceLedgerExportMode) => void;
  onPeriodScopeChange: (value: FinanceVoucherPeriodScope) => void;
  onReset: () => void;
}): SurfaceToolbarItem {
  return {
    kind: "filter-panel",
    key: "group-voucher-filters",
    label: "筛选",
    fields: [
      {
        key: "document-type",
        label: "凭证类别",
        value: documentType,
        allLabel: "全部类别",
        options: GROUP_VOUCHER_DOCUMENT_TYPE_OPTIONS.filter((option) => option.value !== ""),
        onChange: (value) => onDocumentTypeChange(value as "" | FinanceGroupVoucherDocumentType),
      },
      {
        key: "origin",
        label: "生成方式",
        value: origin,
        allLabel: "全部方式",
        options: [
          { value: "manual", label: "人工编制" },
          { value: "system", label: "规则生成" },
        ],
        onChange: (value) => onOriginChange(value as "" | "manual" | "system"),
      },
      {
        key: "period-scope",
        label: "期间范围",
        value: periodScope === "current" ? "" : periodScope,
        allLabel: "当期",
        options: [{ value: "history", label: "历史汇总" }],
        onChange: (value) => onPeriodScopeChange(value === "history" ? "history" : "current"),
      },
      {
        key: "export-mode",
        label: "导出内容",
        value: exportMode === "summary" ? "" : exportMode,
        allLabel: "汇总",
        options: [{ value: "detail", label: "明细" }],
        onChange: (value) => onExportModeChange(value === "detail" ? "detail" : "summary"),
      },
    ],
    onReset,
  };
}
