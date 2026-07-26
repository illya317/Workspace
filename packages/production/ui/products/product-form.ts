import type { CreateSurfaceSectionSpec, FormSurfaceFieldSpec, FormSurfaceSectionSpec } from "@workspace/core/ui";
import type { ProductDraft, ProductSkuDraft } from "@workspace/production/types";

type ProductField = keyof ProductDraft;
type SkuField = keyof ProductSkuDraft;
type DraftValue = string | number | null;

export function emptyProductDraft(): ProductDraft {
  return { code: "", name: "", dosageForm: null, strength: null, approvalNumber: null, status: "active", note: null };
}

export function emptySkuDraft(productName: string): ProductSkuDraft {
  return { code: "", name: productName, specification: null, baseUnit: "盒", contentUnit: "片", unitsPerPackage: null, packagesPerCase: null, barcode: null, status: "active" };
}

function statusField(value: "active" | "inactive", onChange: (value: "active" | "inactive") => void, readOnly: boolean): FormSurfaceFieldSpec {
  return {
    key: "status",
    label: "状态",
    required: true,
    spec: { valueType: "string", control: "choice", options: { source: "static", items: [{ value: "active", label: "启用" }, { value: "inactive", label: "停用" }], visibleCount: 2 } },
    value,
    disabled: readOnly,
    onChange: (next) => onChange(next === "inactive" ? "inactive" : "active"),
  };
}

function textField<T extends string>(key: T, label: string, value: unknown, onChange: (key: T, value: DraftValue) => void, options: { required?: boolean; readOnly?: boolean; multiline?: boolean; span?: 2 } = {}): FormSurfaceFieldSpec {
  return {
    key,
    label,
    required: options.required,
    span: options.span,
    spec: { valueType: "string", control: "text", multiline: options.multiline, validation: options.required ? { required: true } : undefined },
    value: String(value ?? ""),
    readOnly: options.readOnly,
    rows: options.multiline ? 2 : undefined,
    onChange: (next) => onChange(key, String(next ?? "")),
  };
}

function numberField(key: "unitsPerPackage" | "packagesPerCase", label: string, value: number | null, onChange: (key: SkuField, value: DraftValue) => void, readOnly: boolean): FormSurfaceFieldSpec {
  return {
    key,
    label,
    spec: { valueType: "number", control: "number", validation: { min: 0.0001 } },
    value: value ?? "",
    readOnly,
    step: 1,
    onChange: (next) => { const raw = String(next ?? "").trim(); onChange(key, raw ? Number(raw) : null); },
  };
}

export function productFormSections(draft: ProductDraft, onChange: (key: ProductField, value: DraftValue) => void, readOnly = false): CreateSurfaceSectionSpec<FormSurfaceFieldSpec>[] {
  return [{
    key: "product",
    title: "产品身份",
    layout: { columns: 2, density: "compact" },
    items: [
      textField("code", "产品编码", draft.code, onChange, { required: true, readOnly }),
      textField("name", "产品名称", draft.name, onChange, { required: true, readOnly }),
      textField("dosageForm", "剂型", draft.dosageForm, onChange, { readOnly }),
      textField("strength", "含量/规格身份", draft.strength, onChange, { readOnly }),
      textField("approvalNumber", "批准文号", draft.approvalNumber, onChange, { readOnly }),
      statusField(draft.status, (value) => onChange("status", value), readOnly),
      textField("note", "备注", draft.note, onChange, { readOnly, multiline: true, span: 2 }),
    ],
  }];
}

export function productEditSections(draft: ProductDraft, onChange: (key: ProductField, value: DraftValue) => void, readOnly = false): FormSurfaceSectionSpec[] {
  return productFormSections(draft, onChange, readOnly).map((section) => ({ kind: "section", ...section }));
}

export function skuFormSections(draft: ProductSkuDraft, onChange: (key: SkuField, value: DraftValue) => void, readOnly = false): CreateSurfaceSectionSpec<FormSurfaceFieldSpec>[] {
  return [{
    key: "sku",
    title: "SKU 与包装",
    layout: { columns: 2, density: "compact" },
    items: [
      textField("code", "SKU 编码", draft.code, onChange, { required: true, readOnly }),
      textField("name", "SKU 名称", draft.name, onChange, { required: true, readOnly }),
      textField("specification", "销售/库存规格", draft.specification, onChange, { readOnly }),
      textField("baseUnit", "基本单位", draft.baseUnit, onChange, { required: true, readOnly }),
      textField("contentUnit", "最小内容单位", draft.contentUnit, onChange, { readOnly }),
      numberField("unitsPerPackage", "每包装内容数", draft.unitsPerPackage, onChange, readOnly),
      numberField("packagesPerCase", "每件包装数", draft.packagesPerCase, onChange, readOnly),
      textField("barcode", "条码", draft.barcode, onChange, { readOnly }),
      statusField(draft.status, (value) => onChange("status", value), readOnly),
    ],
  }];
}
