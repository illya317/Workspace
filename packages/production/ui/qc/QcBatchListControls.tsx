"use client";

import {
  ActionButton,
  FormField,
  IconActionButton,
  InlineCreatePanel,
  RefreshActionButton,
  SelectField,
  TextField,
  Toolbar,
  ToolbarOptionGroup,
} from "@workspace/core/ui";
import type { QcRecordTemplateSummary } from "@workspace/production/server/qc";

const statusOptions = [
  { value: "all", label: "全部" },
  { value: "pending", label: "待检" },
  { value: "submitted", label: "已提交" },
  { value: "exception", label: "异常" },
];

const pageSizeOptions = [20, 50, 100, 200].map((size) => ({
  value: String(size),
  label: `${size}条/页`,
}));

interface QcBatchToolbarProps {
  statusFilter: string;
  productFilter: string;
  productOptions: Array<{ value: string; label: string }>;
  pageSize: number;
  filteredCount: number;
  counts: { total: number; draft: number; submitted: number };
  onToggleCreate: () => void;
  onStatusFilterChange: (value: string) => void;
  onProductFilterChange: (value: string) => void;
  onPageSizeChange: (value: number) => void;
  onRefresh: () => void;
  onExport: () => void;
}

export function QcBatchToolbar({
  statusFilter,
  productFilter,
  productOptions,
  pageSize,
  filteredCount,
  counts,
  onToggleCreate,
  onStatusFilterChange,
  onProductFilterChange,
  onPageSizeChange,
  onRefresh,
  onExport,
}: QcBatchToolbarProps) {
  return (
    <Toolbar
      viewControls={(
        <IconActionButton label="新建批次" variant="primary" onClick={onToggleCreate}>
          +
        </IconActionButton>
      )}
      filters={(
        <>
          <ToolbarOptionGroup value={statusFilter} onChange={onStatusFilterChange} options={statusOptions} />
          <SelectField
            label="产品"
            value={productFilter}
            onChange={onProductFilterChange}
            placeholder="全部"
            options={productOptions}
            ariaLabel="筛选产品"
            size="toolbar"
            selectClassName="min-w-[7.5rem]"
          />
          <RefreshActionButton onClick={onRefresh} />
        </>
      )}
      selectionActions={<ActionButton onClick={onExport}>导出</ActionButton>}
      meta={(
        <>
          <span>共 {filteredCount} 条 · 全部 {counts.total} · 待检 {counts.draft} · 已提交 {counts.submitted}</span>
          <SelectField
            options={pageSizeOptions}
            value={String(pageSize)}
            onChange={(value) => onPageSizeChange(Number(value))}
            size="toolbar"
            selectClassName="!w-[6.5rem] !min-w-[6.5rem]"
            ariaLabel="每页条数"
          />
        </>
      )}
    />
  );
}

interface QcBatchCreatePanelProps {
  open: boolean;
  products: QcRecordTemplateSummary[];
  productKey: string;
  batchNumber: string;
  submitting: boolean;
  onProductKeyChange: (value: string) => void;
  onBatchNumberChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export function QcBatchCreatePanel({
  open,
  products,
  productKey,
  batchNumber,
  submitting,
  onProductKeyChange,
  onBatchNumberChange,
  onSubmit,
  onCancel,
}: QcBatchCreatePanelProps) {
  if (!open) return null;

  return (
    <InlineCreatePanel
      title="新建批次"
      onSubmit={onSubmit}
      onCancel={onCancel}
      submitDisabled={submitting || !productKey || !batchNumber.trim()}
      submitting={submitting}
    >
      <FormField label="产品" required layout="inline">
        <SelectField
          value={productKey}
          onChange={onProductKeyChange}
          options={products.map((product) => ({ value: product.id, label: product.productName }))}
          ariaLabel="产品"
          size="toolbar"
          selectClassName="!w-[7.5rem] !min-w-[7.5rem]"
        />
      </FormField>
      <FormField label="批号" required layout="inline">
        <TextField
          value={batchNumber}
          onChange={onBatchNumberChange}
          placeholder="请输入批号"
          className="w-36 rounded-lg border-2 border-emerald-500 px-3 shadow-sm focus:ring-2 focus:ring-emerald-100"
          style={{ width: "9rem" }}
        />
      </FormField>
    </InlineCreatePanel>
  );
}
