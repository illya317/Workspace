"use client";

import { PageSurface, createPageFieldsBlock } from "@workspace/core/ui";
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
  return <PageSurface
    kind="detail"
    embedded
    blocks={[
      createPageFieldsBlock("qc-batch-create", [
        { kind: "groupTitle", key: "title", title: "新建批次" },
        {
          key: "product",
          label: "产品",
          required: true,
          spec: {
            valueType: "string",
            control: "choice",
            options: {
              source: "static",
              mode: "autocomplete",
              visibleCount: 5,
              items: products.map(product => ({ value: product.id, label: product.productName })),
            },
          },
          value: productKey,
          onChange: (value) => onProductKeyChange(String(value ?? "")),
          placeholder: "搜索产品",
        },
        {
          key: "batchNumber",
          label: "批号",
          required: true,
          spec: { valueType: "string", control: "text" },
          value: batchNumber,
          onChange: (value) => onBatchNumberChange(String(value ?? "")),
          placeholder: "请输入批号",
          className: "w-36",
        },
      ], {
        columns: 3,
        onSubmit,
        actions: [
          {
            key: "submit",
            label: submitting ? "创建中..." : "创建",
            type: "submit",
            variant: "primary",
            disabled: submitting || !productKey || !batchNumber.trim(),
          },
          { key: "cancel", label: "取消", onClick: onCancel },
        ],
      }),
    ]}
  />;
}
