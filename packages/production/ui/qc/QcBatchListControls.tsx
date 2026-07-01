"use client";

import { createFormSection, createPageBody, PageSurface, type BodySurfaceSectionSpec, type FormSurfaceItemSpec } from "@workspace/core/ui";
export { QC_BATCH_PAGE_SIZE_OPTIONS, QC_BATCH_STATUS_OPTIONS } from "./qc-options";

interface QcProductOption {
  id: string;
  productName: string;
}

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
export function createQcBatchCreateSection({
  open,
  products,
  productKey,
  batchNumber,
  submitting,
  onProductKeyChange,
  onBatchNumberChange,
  onSubmit,
  onCancel,
}: QcBatchCreatePanelProps): BodySurfaceSectionSpec | null {
  if (!open) return null;
  const formItems: FormSurfaceItemSpec[] = [
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
    },
  ];
  const formSection = createFormSection("qc-create", {
    kind: "filters",
    content: { items: formItems, layout: { flow: "inline", columns: 3, commandPlacement: "inline" } },
    submit: { onSubmit },
    commands: [
      {
        key: "save",
        label: submitting ? "创建中..." : "创建",
        icon: "add",
        type: "submit",
        variant: "primary",
        disabled: submitting || !productKey || !batchNumber.trim(),
      },
      { key: "cancel", label: "取消", icon: "cancel", onClick: onCancel },
    ],
  }, { autoReveal: true });
  return {
    ...formSection,
    chrome: "card",
  };
}

export function QcBatchCreatePanel(props: QcBatchCreatePanelProps) {
  const section = createQcBatchCreateSection(props);
  if (!section) return null;
  return <PageSurface kind="standard" embedded body={createPageBody([section])} />;
}
