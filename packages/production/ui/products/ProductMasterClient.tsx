"use client";

import { useEffect, useMemo, useState } from "react";
import {
  PageSurface,
  createMasterDetailBody,
  createEmptySection,
  createFieldsSection,
  createMessageSection,
  createPageBody,
  createPageTableSection,
  createPageTabBar,
  useFeedback,
  type BodySurfaceSectionSpec,
  type DataSurfaceColumnSpec,
  type SelectorSurfaceProps,
  type SurfaceToolbarItems,
} from "@workspace/core/ui";
import type { ProductDraft, ProductRecord, ProductSkuDraft, ProductSkuRecord, ProductSourceMappingRecord } from "@workspace/production/types";
import { emptyProductDraft, emptySkuDraft, productEditSections, productFormSections, skuFormSections } from "./product-form";
import { useProducts } from "./useProducts";

type View = "product" | "skus" | "mappings";
const skuColumns: DataSurfaceColumnSpec<ProductSkuRecord>[] = [
  { key: "code", label: "SKU 编码", required: true, font: "mono", cell: (row) => row.code },
  { key: "specification", label: "销售/库存规格", required: true, cell: (row) => row.specification || "—" },
  { key: "unit", label: "基本单位", cell: (row) => row.baseUnit },
  { key: "content", label: "包装内容", cell: (row) => row.unitsPerPackage ? `${row.unitsPerPackage} ${row.contentUnit ?? "单位"}` : "—" },
  { key: "case", label: "件装量", cell: (row) => row.packagesPerCase ? `${row.packagesPerCase} ${row.baseUnit}/件` : "—" },
  { key: "barcode", label: "条码", font: "mono", cell: (row) => row.barcode || "—" },
  { key: "status", label: "状态", cell: (row) => ({ kind: "badge", label: row.status === "active" ? "启用" : "停用", tone: row.status === "active" ? "green" : "gray" }) },
];

const mappingColumns: DataSurfaceColumnSpec<ProductSourceMappingRecord>[] = [
  { key: "source", label: "来源系统", required: true, cell: (row) => row.sourceSystem },
  { key: "name", label: "来源名称", required: true, cell: (row) => row.sourceName },
  { key: "spec", label: "来源规格", cell: (row) => row.sourceSpecification || "—" },
  { key: "target", label: "关联结果", required: true, cell: (row) => row.targetLabel || "待关联" },
  { key: "status", label: "状态", cell: (row) => ({ kind: "badge", label: row.status === "pending" ? "待关联" : "已确认", tone: row.status === "pending" ? "amber" : "green" }) },
  { key: "file", label: "来源文件", cell: (row) => row.sourceFile || "—" },
];

export default function ProductMasterClient({ canCreate, canUpdate }: { canCreate: boolean; canUpdate: boolean }) {
  const products = useProducts();
  const feedback = useFeedback();
  const [view, setView] = useState<View>("product");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [productDraft, setProductDraft] = useState<ProductDraft | null>(null);
  const [createDraft, setCreateDraft] = useState<ProductDraft | null>(null);
  const [skuDraft, setSkuDraft] = useState<ProductSkuDraft | null>(null);
  const [skuId, setSkuId] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const selected = products.items.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    const current = products.items.find((item) => item.id === selectedId);
    if (!current && products.items[0]) setSelectedId(products.items[0].id);
  }, [products.items, selectedId]);

  useEffect(() => {
    if (!selected || dirty) return;
    setProductDraft(toDraft(selected));
  }, [dirty, selected]);

  const tabbar = useMemo(() => createPageTabBar({ items: [{ key: "product", label: "产品信息" }, { key: "skus", label: "SKU包装" }, { key: "mappings", label: "来源映射" }], active: view, onChange: (key) => setView(key as View), ariaLabel: "产品主档视图" }), [view]);

  const selector: SelectorSurfaceProps<ProductRecord> = {
    kind: "list",
    title: "产品目录",
    selectedId,
    loading: products.loading,
    emptyText: products.error ? `加载失败：${products.error}` : "暂无产品，请先导入产成品入库表",
    items: products.items.map((item) => ({ key: item.id, value: item, group: item.dosageForm || "未分类剂型", card: { title: item.name, subtitle: [item.strength, `${item.skus.length} 个 SKU`].filter(Boolean).join(" · "), code: item.code, status: { label: item.status === "active" ? "启用" : "停用", tone: item.status === "active" ? "success" : "muted" }, tone: "emerald" } })),
    onSelect: (item) => { setSelectedId(item.id); setProductDraft(toDraft(item)); setDirty(false); },
  };

  const toolbarItems: SurfaceToolbarItems = [
    { kind: "search", key: "search", value: products.keyword, onChange: products.setKeyword, placeholder: "搜索产品、SKU、规格或批准文号", scope: ["产品", "SKU", "规格", "批准文号"] },
    { kind: "action-group", key: "actions", actions: [{ key: "refresh", kind: "refresh", label: "刷新", onClick: () => void products.load() }] },
    { kind: "text", key: "total", content: `产品 ${products.total} · 待关联 ${products.pendingMappingCount}` },
  ];

  const createSection: BodySurfaceSectionSpec = { key: "product-create", body: { kind: "create", create: {
    id: "production-product-create", trigger: "toolbar", presentation: "modal", title: "新增产品", open: Boolean(createDraft), canCreate, disabled: saving,
    content: { kind: "sections", sections: productFormSections(createDraft ?? emptyProductDraft(), (key, value) => setCreateDraft((current) => current ? { ...current, [key]: value } as ProductDraft : current)) },
    submission: { action: "save", disabled: saving || !createDraft?.code.trim() || !createDraft.name.trim(), execute: saveNewProduct },
    onOpenChange: (open) => setCreateDraft(open ? emptyProductDraft() : null), onCancel: () => setCreateDraft(null),
  } } };

  return <PageSurface kind="standard" tabbar={tabbar} toolbar={{ items: toolbarItems }} body={createMasterDetailBody({ master: { label: "产品目录", presentation: "compact", body: { kind: "selector", selector } }, detail: createPageBody([createSection, ...detailSections()]), desktop: { ratio: [1, 3] } })} />;

  function detailSections(): BodySurfaceSectionSpec[] {
    if (!selected) return [createEmptySection("product-empty", { content: "从左侧选择产品查看详情", presentation: "card" })];
    if (view === "product") return [createFieldsSection("product-detail", productEditSections(productDraft ?? toDraft(selected), (key, value) => { if (!canUpdate) return; setProductDraft((current) => current ? { ...current, [key]: value } as ProductDraft : current); setDirty(true); }, !canUpdate), { header: { title: selected.name, description: `${selected.code}${selected.strength ? ` · ${selected.strength}` : ""}` }, actions: canUpdate ? [{ key: "reset", action: "reset", label: "撤销修改", disabled: saving || !dirty, onClick: () => { setProductDraft(toDraft(selected)); setDirty(false); } }, { key: "save", action: "save", label: saving ? "保存中..." : "保存", disabled: saving || !dirty || !productDraft?.code.trim() || !productDraft.name.trim(), onClick: () => void saveProduct() }] : [] })];
    if (view === "skus") return [skuCreateSection(), createPageTableSection("product-skus", { rows: selected.skus, columns: skuColumns, visibleColumns: skuColumns.map((column) => column.key), rowKey: (row) => row.id, rowActions: canUpdate ? (row) => [{ key: "edit", label: "编辑", kind: "edit", onClick: () => { setSkuId(row.id); setSkuDraft({ ...row }); } }] : undefined, actionsColumn: canUpdate ? { label: "操作" } : undefined, emptyText: "暂无 SKU，请先导入产成品入库表", presentation: { density: "compact" }, scroll: { x: true } })];
    const confirmed = selected.sourceMappings;
    return [
      ...(products.pendingMappingCount ? [createMessageSection("pending-source-note", { tone: "warning", content: `还有 ${products.pendingMappingCount} 个来源名称/规格未能唯一匹配。它们会保留原文，不会猜测性写入产品 FK。` })] : []),
      createPageTableSection("product-source-mappings", { rows: confirmed, columns: mappingColumns, visibleColumns: mappingColumns.map((column) => column.key), rowKey: (row) => row.id, emptyText: "该产品暂无来源映射", presentation: { density: "compact" }, scroll: { x: true } }),
      ...(products.pendingMappings.length ? [createPageTableSection("pending-source-mappings", { rows: products.pendingMappings, columns: mappingColumns, visibleColumns: mappingColumns.map((column) => column.key), rowKey: (row) => row.id, emptyText: "没有待关联来源", presentation: { density: "compact" }, scroll: { x: true } })] : []),
    ];
  }

  function skuCreateSection(): BodySurfaceSectionSpec {
    const editing = skuId !== null;
    return { key: "sku-create", body: { kind: "create", create: { id: "production-sku-create", trigger: "toolbar", presentation: "modal", title: editing ? "编辑 SKU" : "新增 SKU", open: Boolean(skuDraft), canCreate: editing ? canUpdate : canCreate, disabled: saving, content: { kind: "sections", sections: skuFormSections(skuDraft ?? emptySkuDraft(selected?.name ?? ""), (key, value) => setSkuDraft((current) => current ? { ...current, [key]: value } as ProductSkuDraft : current)) }, submission: { action: "save", disabled: saving || !skuDraft?.code.trim() || !skuDraft.name.trim() || !skuDraft.baseUnit.trim(), execute: saveSku }, onOpenChange: (open) => { setSkuId(null); setSkuDraft(open ? emptySkuDraft(selected?.name ?? "") : null); }, onCancel: () => { setSkuId(null); setSkuDraft(null); } } } };
  }

  async function saveNewProduct() { if (!createDraft) return; setSaving(true); try { const result = await products.saveProduct(createDraft); if (!result.ok) return feedback.error(result.error); setCreateDraft(null); feedback.success("产品已创建"); } finally { setSaving(false); } }
  async function saveProduct() { if (!selected || !productDraft) return; setSaving(true); try { const result = await products.saveProduct(productDraft, selected.id); if (!result.ok) return feedback.error(result.error); setDirty(false); feedback.success("产品信息已保存"); } finally { setSaving(false); } }
  async function saveSku() { if (!selected || !skuDraft) return; setSaving(true); try { const result = await products.saveSku(selected.id, skuDraft, skuId ?? undefined); if (!result.ok) return feedback.error(result.error); setSkuId(null); setSkuDraft(null); feedback.success("SKU 信息已保存"); } finally { setSaving(false); } }
}

function toDraft(product: ProductRecord): ProductDraft { return { code: product.code, name: product.name, dosageForm: product.dosageForm, strength: product.strength, approvalNumber: product.approvalNumber, status: product.status, note: product.note, version: product.version }; }
