"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import {
  PageSurface,
  createMessageSection,
  createMetricsSection,
  createPageBody,
  createPageTableSection,
  createPageTabBar,
  createStatusSection,
  useFeedback,
  type BodySurfaceSectionSpec,
  type DataSurfaceRowActionSpec,
  type FormSurfaceFieldSpec,
  type PageSurfaceCreateSpec,
  type PageSurfaceTabBarItemSpec,
  type SurfaceToolbarItems,
} from "@workspace/core/ui";
import { useCompanyOptions } from "@workspace/platform/hooks";
import { matchSearchFields } from "@workspace/platform/search";
import type { CreateInventoryDocumentInput, InventoryDocumentDto, InventoryWorkspaceDto } from "../types";
import {
  batchColumns,
  documentColumns,
  documentFormSections,
  emptyDocumentDraft,
  importColumns,
  itemColumns,
  postingColumns,
  stocktakeColumns,
} from "./inventoryOperationsUi";

type InventoryView = "overview" | "items" | "movements" | "batches" | "stocktakes" | "closing" | "imports";
const TABS: PageSurfaceTabBarItemSpec[] = [
  { key: "overview", label: "库存总览" }, { key: "items", label: "产品库存" }, { key: "movements", label: "出入库" },
  { key: "batches", label: "批次" }, { key: "stocktakes", label: "盘点" }, { key: "closing", label: "财务计价" }, { key: "imports", label: "导入记录" },
];

export default function InventoryOperationsClient({
  defaultScope,
  canCreate,
  canUpdate,
  canReverse,
  canLock,
}: {
  defaultScope: { companyCode: string; year: number; month: number } | null;
  canCreate: boolean;
  canUpdate: boolean;
  canReverse: boolean;
  canLock: boolean;
}) {
  const [view, setView] = useState<InventoryView>("overview");
  const [companyCode, setCompanyCode] = useState(defaultScope?.companyCode ?? "");
  const [year, setYear] = useState(String(defaultScope?.year ?? new Date().getFullYear()));
  const [month, setMonth] = useState(String(defaultScope?.month ?? new Date().getMonth() + 1));
  const [keyword, setKeyword] = useState("");
  const [workspace, setWorkspace] = useState<InventoryWorkspaceDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documentDraft, setDocumentDraft] = useState<CreateInventoryDocumentInput | null>(null);
  const [voucherDraft, setVoucherDraft] = useState<number | null>(null);
  const companyOptions = useCompanyOptions();
  const feedback = useFeedback();

  const load = useCallback(async () => {
    if (!companyCode || !year || !month) { setWorkspace(null); return; }
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ companyCode, year, month });
      const response = await fetch(workspacePath(`/api/modules/inventory/operations?${params.toString()}`));
      const data = await response.json().catch(() => null) as InventoryWorkspaceDto | { error?: string } | null;
      if (!response.ok) throw new Error(errorMessage(data, `加载失败 (${response.status})`));
      setWorkspace(data as InventoryWorkspaceDto);
    } catch (caught) {
      setWorkspace(null); setError(caught instanceof Error ? caught.message : "库存运营台加载失败");
    } finally { setLoading(false); }
  }, [companyCode, month, year]);

  useEffect(() => { void load(); }, [load]);

  const navigation = useMemo(() => createPageTabBar({ items: TABS, active: view, onChange: (key) => setView(key as InventoryView), ariaLabel: "库存运营视图" }), [view]);
  const items = useMemo(() => (workspace?.items ?? []).filter((row) => matchSearchFields(row, keyword, ["code", "name", "specification", "itemType"])), [keyword, workspace?.items]);
  const documents = useMemo(() => (workspace?.documents ?? []).filter((row) => matchSearchFields(row, keyword, ["documentNo", "counterparty", "referenceNo", "sourceSheet"])), [keyword, workspace?.documents]);

  const toolbarItems: SurfaceToolbarItems = [
    { kind: "search", key: "search", value: keyword, onChange: setKeyword, placeholder: "搜索物料、单据或来源" },
    { kind: "select", key: "company", label: "公司", options: companyOptions, value: companyCode, onChange: (value) => { setCompanyCode(value); closeDrafts(); } },
    { kind: "select", key: "year", label: "年度", options: [2024, 2025, 2026, 2027].map((value) => ({ value: String(value), label: String(value) })), value: year, onChange: (value) => { setYear(value); closeDrafts(); } },
    { kind: "select", key: "month", label: "月份", options: Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1), label: `${index + 1}月` })), value: month, onChange: (value) => { setMonth(value); closeDrafts(); } },
    { kind: "text", key: "closing-status", content: workspace?.closing.status === "closed" ? "存货期间已结转" : "存货期间开放" },
  ];

  const sections: BodySurfaceSectionSpec[] = [
    ...(loading ? [createStatusSection("inventory-loading", { kind: "loading", content: "正在加载库存运营台" })] : []),
    ...(error ? [createStatusSection("inventory-error", { kind: "error", content: error })] : []),
    ...(!loading && !error ? buildSections(view, workspace, items, documents, lifecycleActions) : []),
  ];
  const pageCreate = view === "movements"
    ? documentCreate()
    : view === "closing"
      ? voucherLinkCreate()
      : undefined;

  return <PageSurface kind="standard" create={pageCreate} tabbar={navigation} toolbar={{ items: toolbarItems }} body={createPageBody(sections)} />;

  function closeDrafts() { setDocumentDraft(null); setVoucherDraft(null); }

  function lifecycleActions(row: InventoryDocumentDto) {
    if (row.status === "draft" && canUpdate) return [{ key: "post", label: "过账", kind: "save" as const, disabled: saving, onClick: () => void lifecycle(row.id, "post") }];
    if (row.status === "posted" && canReverse) return [{ key: "reverse", label: "冲销", kind: "archive" as const, disabled: saving, onClick: () => void lifecycle(row.id, "reverse") }];
    return [];
  }

  async function lifecycle(id: number, action: "post" | "reverse") {
    setSaving(true);
    try { await postJson(`/api/modules/inventory/operations/documents/${id}/${action}`, {}); feedback.success(action === "post" ? "单据已过账" : "单据已生成反向流水并冲销"); await load(); }
    catch (caught) { feedback.error(caught instanceof Error ? caught.message : "单据处理失败"); }
    finally { setSaving(false); }
  }

  async function saveDocument() {
    if (!documentDraft) return;
    setSaving(true);
    try { await postJson("/api/modules/inventory/operations/documents", documentDraft); setDocumentDraft(null); await load(); return { outcome: "saved" as const, message: "存货单据草稿已创建" }; }
    finally { setSaving(false); }
  }

  async function linkVoucher() {
    if (!voucherDraft) return;
    setSaving(true);
    try { await postJson("/api/modules/inventory/operations/closing/link-voucher", { companyCode, year: Number(year), month: Number(month), voucherId: voucherDraft }); setVoucherDraft(null); await load(); return { outcome: "saved" as const, message: "计价凭证已关联，存货期间已结转" }; }
    finally { setSaving(false); }
  }

  function documentCreate(): PageSurfaceCreateSpec {
    const date = `${year}-${month.padStart(2, "0")}-01`;
    const empty = emptyDocumentDraft(companyCode, date, workspace?.items[0], workspace?.warehouses[0]);
    return {
      id: "inventory-document-create", presentation: "modal", title: "新建出入库单", open: Boolean(documentDraft), canCreate, disabled: saving || workspace?.closing.status === "closed",
      content: { kind: "sections", sections: documentFormSections(documentDraft ?? empty, workspace, setDocumentDraft) },
      submission: { action: "save", disabled: saving || !documentDraft?.documentNo || !documentDraft.lines[0]?.itemId || !documentDraft.lines[0]?.warehouseId, execute: saveDocument }, onOpenChange: (open) => setDocumentDraft(open ? empty : null), onCancel: () => setDocumentDraft(null),
    };
  }

  function voucherLinkCreate(): PageSurfaceCreateSpec {
    const field: FormSurfaceFieldSpec = { key: "voucherId", label: "已过账凭证ID", required: true, spec: { valueType: "number", control: "number", validation: { min: 1 } }, value: voucherDraft ?? "", step: 1, onChange: (value) => setVoucherDraft(Number(value) || null) };
    return {
      id: "inventory-voucher-link", presentation: "modal", title: "关联成本结转凭证", open: voucherDraft !== null, canCreate: canLock && workspace?.closing.status !== "closed", disabled: saving,
      content: { kind: "sections", sections: [{ key: "voucher", title: "期间结转", layout: { columns: 1, density: "compact" }, items: [field] }] }, submission: { action: "save", disabled: saving || !voucherDraft, execute: linkVoucher }, onOpenChange: (open) => setVoucherDraft(open ? 0 : null), onCancel: () => setVoucherDraft(null),
    };
  }
}

function buildSections(view: InventoryView, workspace: InventoryWorkspaceDto | null, items: InventoryWorkspaceDto["items"], documents: InventoryWorkspaceDto["documents"], rowActions: (row: InventoryDocumentDto) => DataSurfaceRowActionSpec[]): BodySurfaceSectionSpec[] {
  if (!workspace) return [createStatusSection("inventory-empty", { kind: "empty", content: "请选择公司和期间" })];
  if (view === "overview") return [
    createMetricsSection("inventory-metrics", { metrics: [
      { key: "items", label: "物料", value: workspace.metrics.itemCount }, { key: "onHand", label: "账面库存", value: formatNumber(workspace.metrics.onHandQuantity) },
      { key: "receipts", label: "本期入库", value: formatNumber(workspace.metrics.receiptQuantity) }, { key: "issues", label: "本期出库", value: formatNumber(workspace.metrics.issueQuantity) },
      { key: "variance", label: "盘点差异", value: formatNumber(workspace.metrics.stocktakeVariance) }, { key: "value", label: "期末计价", value: `¥${formatAmount(workspace.closing.inventoryValue)}` },
    ] }),
    ...(workspace.metrics.stocktakeVariance !== 0 ? [createMessageSection("inventory-variance", { tone: "warning", content: `本期盘点存在差异 ${formatNumber(workspace.metrics.stocktakeVariance)}；差异先保留为盘点事实，需审核后另行生成调整单，不直接改写账面流水。` })] : []),
    createPageTableSection("inventory-recent-documents", { rows: documents.slice(0, 10), columns: documentColumns, visibleColumns: documentColumns.map((column) => column.key), rowKey: (row) => row.id, rowActions, actionsColumn: { label: "单据操作" }, emptyText: "本期暂无出入库单", presentation: { density: "compact" }, scroll: { x: true } }),
  ];
  if (view === "items") return [createMetricsSection("item-metrics", { metrics: [{ key: "count", label: "产品 SKU", value: items.length }, { key: "quantity", label: "账面库存", value: formatNumber(items.reduce((sum, row) => sum + row.onHand, 0)) }] }), createMessageSection("item-owner", { tone: "muted", content: "产品和 SKU 主数据在生产管理的“产品主档”维护；这里仅展示库存账面事实。" }), createPageTableSection("inventory-items", { rows: items, columns: itemColumns, visibleColumns: itemColumns.map((column) => column.key), rowKey: (row) => row.id, emptyText: "暂无产品库存", presentation: { density: "compact" }, scroll: { x: true } })];
  if (view === "movements") return [createMetricsSection("movement-metrics", { metrics: [{ key: "documents", label: "本期单据", value: documents.length }, { key: "receipts", label: "入库数量", value: formatNumber(workspace.metrics.receiptQuantity) }, { key: "issues", label: "出库数量", value: formatNumber(workspace.metrics.issueQuantity) }] }), createPageTableSection("inventory-documents", { rows: documents, columns: documentColumns, visibleColumns: documentColumns.map((column) => column.key), rowKey: (row) => row.id, rowActions, actionsColumn: { label: "单据操作" }, emptyText: "本期暂无出入库单", presentation: { density: "compact" }, scroll: { x: true } })];
  if (view === "batches") return [createMetricsSection("batch-metrics", { metrics: [{ key: "count", label: "批次", value: workspace.batches.length }, { key: "nearExpiry", label: "临期批次", value: workspace.metrics.nearExpiryBatchCount }] }), createPageTableSection("inventory-batches", { rows: workspace.batches, columns: batchColumns, visibleColumns: batchColumns.map((column) => column.key), rowKey: (row) => row.id, emptyText: "暂无批次", presentation: { density: "compact" }, scroll: { x: true } })];
  if (view === "stocktakes") return [createMetricsSection("stocktake-metrics", { metrics: [{ key: "rows", label: "盘点明细", value: workspace.stocktakes.length }, { key: "variance", label: "盘点差异", value: formatNumber(workspace.metrics.stocktakeVariance) }] }), createMessageSection("stocktake-rule", { tone: "muted", content: "盘点差异与不可变出入库流水分开保存；复核后通过调整单入账，避免直接覆盖历史库存。" }), createPageTableSection("inventory-stocktakes", { rows: workspace.stocktakes, columns: stocktakeColumns, visibleColumns: stocktakeColumns.map((column) => column.key), rowKey: (row) => row.id, emptyText: "本期暂无盘点", presentation: { density: "compact" }, scroll: { x: true } })];
  if (view === "closing") return [createMetricsSection("closing-metrics", { metrics: [{ key: "onHand", label: "期末数量", value: formatNumber(workspace.closing.onHandQuantity) }, { key: "value", label: "期末存货价值", value: `¥${formatAmount(workspace.closing.inventoryValue)}` }, { key: "voucher", label: "关联凭证", value: workspace.closing.linkedVoucherId ? `#${workspace.closing.linkedVoucherId}` : "未关联" }, { key: "status", label: "期间状态", value: workspace.closing.status === "closed" ? "已结转" : "开放" }] }), createMessageSection("closing-rule", { tone: "muted", content: "期末价值按不可变流水的数量 × 单位成本计算；发出成本按移动加权平均计价，结转凭证关联前会校验 6401 借方与 1405 贷方。" }), createPageTableSection("inventory-posting", { rows: workspace.closing.postingProposal, columns: postingColumns, visibleColumns: postingColumns.map((column) => column.key), rowKey: (row) => `${row.accountCode}-${row.direction}`, emptyText: "本期没有需要结转的发出存货成本", presentation: { density: "compact" } })];
  return [createMetricsSection("import-metrics", { metrics: [{ key: "batches", label: "导入批次", value: workspace.imports.length }, { key: "warnings", label: "警告", value: workspace.imports.reduce((sum, row) => sum + row.warningCount, 0) }] }), createPageTableSection("inventory-imports", { rows: workspace.imports, columns: importColumns, visibleColumns: importColumns.map((column) => column.key), rowKey: (row) => row.id, emptyText: "暂无导入记录", presentation: { density: "compact" }, scroll: { x: true } })];
}

function formatAmount(value: number) { return value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function formatNumber(value: number) { return value.toLocaleString("zh-CN", { maximumFractionDigits: 6 }); }
function errorMessage(value: unknown, fallback: string) { return value && typeof value === "object" && "error" in value && typeof value.error === "string" ? value.error : fallback; }
async function postJson(path: string, body: unknown) { const response = await fetch(workspacePath(path), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const data = await response.json().catch(() => null); if (!response.ok) throw new Error(errorMessage(data, `操作失败 (${response.status})`)); return data; }
