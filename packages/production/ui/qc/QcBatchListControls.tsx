"use client";

import { CreatePanel, FormField, SelectField, TextField } from "@workspace/core/ui";
interface QcProductOption {
  id: string;
  productName: string;
}
export const QC_BATCH_STATUS_OPTIONS = [{
  value: "all",
  label: "全部"
}, {
  value: "exception",
  label: "异常"
}, {
  value: "accepted",
  label: "已验收"
}, {
  value: "inspecting",
  label: "检验中"
}, {
  value: "reviewing",
  label: "待复核"
}];
export const QC_BATCH_PAGE_SIZE_OPTIONS = [20, 50, 100, 200].map(size => ({
  value: String(size),
  label: `${size}条/页`
}));
interface QcBatchCreatePanelProps {
  open: boolean;
  products: QcProductOption[];
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
  onCancel
}: QcBatchCreatePanelProps) {
  if (!open) return null;
  return <CreatePanel variant="inline" title="新建批次" onSubmit={onSubmit} onCancel={onCancel} submitDisabled={submitting || !productKey || !batchNumber.trim()} submitting={submitting}>
      <FormField label="产品" required>
        <SelectField value={productKey} onChange={onProductKeyChange} options={products.map(product => ({
        value: product.id,
        label: product.productName
      }))} ariaLabel="产品" />
      </FormField>
      <FormField label="批号" required>
        <TextField value={batchNumber} onChange={onBatchNumberChange} placeholder="请输入批号" visualVariant="emphasis" style={{
        width: "9rem"
      }} />
      </FormField>
    </CreatePanel>;
}
