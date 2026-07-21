"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import { matchSearchFields } from "@workspace/platform/search";
import {
  PageSurface,
  createFieldsSection,
  createMessageSection,
  createPageBody,
  createPageTableSection,
  createStatusSection,
  useFeedback,
  type BodySurfaceSectionSpec,
  type PageSurfaceTabBarSpec,
  type SurfaceToolbarItems,
} from "@workspace/core/ui";
import type {
  CreateFinanceAssetAdjustmentInput,
  CreateFinanceAssetCardInput,
  FinanceAssetCardDto,
  FinanceAssetWorkspaceDto,
  UpdateFinanceAssetCardInput,
} from "../../types/assets";
import { useFinanceFilterToolbarItems } from "../components/FinanceFilters";
import type { FinanceLedgerDefaultScope } from "./defaultScope";
import {
  adjustmentFormSections,
  assetAdjustmentColumns,
  assetCardColumns,
  assetFormSections,
  assetPeriodColumns,
  assetReconciliationColumns,
  emptyAdjustmentDraft,
  emptyAssetDraft,
  editAssetDraft,
} from "./assetScheduleUi";

type AssetView = "cards" | "period" | "adjustments" | "reconciliation";

export default function AssetScheduleTab({
  canCreate,
  canUpdate,
  canRevise,
  defaultScope,
  navigation,
  lifecycleBlocks = [],
}: {
  canCreate: boolean;
  canUpdate: boolean;
  canRevise: boolean;
  defaultScope: FinanceLedgerDefaultScope | null;
  navigation?: PageSurfaceTabBarSpec;
  lifecycleBlocks?: BodySurfaceSectionSpec[];
}) {
  const [companyCode, setCompanyCode] = useState(defaultScope?.companyCode ?? "");
  const [year, setYear] = useState(String(defaultScope?.year ?? ""));
  const [month, setMonth] = useState(String(defaultScope?.month ?? ""));
  const [keyword, setKeyword] = useState("");
  const [workspace, setWorkspace] = useState<FinanceAssetWorkspaceDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assetDraft, setAssetDraft] = useState<CreateFinanceAssetCardInput | null>(null);
  const [editingAssetDraft, setEditingAssetDraft] = useState<UpdateFinanceAssetCardInput | null>(null);
  const [adjustmentDraft, setAdjustmentDraft] = useState<CreateFinanceAssetAdjustmentInput | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [saving, setSaving] = useState(false);
  const feedback = useFeedback();
  const activeView: AssetView = isAssetView(navigation?.activeChild) ? navigation.activeChild : "cards";

  const load = useCallback(async () => {
    if (!companyCode || !year || !month) {
      setWorkspace(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ companyCode, year, month });
      const response = await fetch(workspacePath(`/api/modules/finance/ledger/assets?${params.toString()}`));
      const data = await response.json().catch(() => null) as FinanceAssetWorkspaceDto | { error?: string } | null;
      if (!response.ok) throw new Error(errorMessage(data, `加载失败 (${response.status})`));
      setWorkspace(data as FinanceAssetWorkspaceDto);
    } catch (caught) {
      setWorkspace(null);
      setError(caught instanceof Error ? caught.message : "资产折旧摊销加载失败");
    } finally {
      setLoading(false);
    }
  }, [companyCode, month, year]);

  useEffect(() => { void load(); }, [load]);

  async function saveAsset() {
    if (!assetDraft) return;
    setSaving(true);
    try {
      await postJson("/api/modules/finance/ledger/assets", assetDraft);
      setAssetDraft(null);
      await load();
      return { outcome: "saved" as const, message: "资产卡片已创建" };
    } finally {
      setSaving(false);
    }
  }

  async function saveAdjustment() {
    if (!adjustmentDraft) return;
    setSaving(true);
    try {
      await postJson("/api/modules/finance/ledger/asset-adjustments", adjustmentDraft);
      setAdjustmentDraft(null);
      await load();
      return { outcome: "saved" as const, message: "调整事项已记录" };
    } finally {
      setSaving(false);
    }
  }

  async function saveAssetEdit() {
    if (!editingAssetDraft) return;
    setSaving(true);
    try {
      await putJson("/api/modules/finance/ledger/assets", editingAssetDraft);
      setEditingAssetDraft(null);
      feedback.success("资产卡片已更新；如计算政策有变化，请重新计算开放期间");
      await load();
    } catch (caught) {
      feedback.error(caught instanceof Error ? caught.message : "资产卡片更新失败");
    } finally {
      setSaving(false);
    }
  }

  async function recalculate() {
    if (!companyCode || !year || !month) return;
    setSaving(true);
    try {
      await postJson("/api/modules/finance/ledger/asset-periods/recalculate", { companyCode, year: Number(year), month: Number(month) });
      feedback.success("本期折旧摊销已重新计算");
      await load();
    } catch (caught) {
      feedback.error(caught instanceof Error ? caught.message : "重新计算失败");
    } finally {
      setSaving(false);
    }
  }

  const cards = useMemo(() => (workspace?.cards ?? []).filter((row) => matchSearchFields(row, keyword, ["assetCode", "name", "category", "assetAccountCode"])), [keyword, workspace?.cards]);
  const periodRows = useMemo(() => (workspace?.periodRows ?? []).filter((row) => matchSearchFields(row, keyword, ["assetCode", "name", "accountCode"])), [keyword, workspace?.periodRows]);
  const total = activeView === "cards" ? cards.length : activeView === "period" ? periodRows.length : activeView === "adjustments" ? workspace?.adjustments.length ?? 0 : workspace?.reconciliation.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => { setPage(1); }, [activeView, companyCode, keyword, month, pageSize, year]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const extraItems: SurfaceToolbarItems = [
    ...(activeView === "period" && canRevise ? [{ kind: "action-group" as const, key: "asset-period-actions", actions: [{ key: "recalculate", kind: "refresh" as const, label: "重新计算", disabled: saving || workspace?.scope.isClosed, onClick: () => void recalculate() }] }] : []),
    ...(activeView === "cards" ? [] : [{ kind: "text" as const, key: "asset-period-state", content: periodStateText(workspace) }]),
  ];
  const toolbarItems = useFinanceFilterToolbarItems({
    companyFilter: companyCode,
    yearFilter: year,
    monthFilter: month,
    keyword,
    pageSize,
    onCompanyChange: (value) => { setCompanyCode(value); setAssetDraft(null); setEditingAssetDraft(null); setAdjustmentDraft(null); },
    onYearChange: (value) => { setYear(value); setAssetDraft(null); setEditingAssetDraft(null); setAdjustmentDraft(null); },
    onMonthChange: (value) => { setMonth(value); setAssetDraft(null); setEditingAssetDraft(null); setAdjustmentDraft(null); },
    onKeywordChange: setKeyword,
    onPageSizeChange: setPageSize,
    extraItems,
  });
  const sections = [
    ...lifecycleBlocks,
    ...(loading ? [createStatusSection("asset-loading", { kind: "loading", content: "正在加载资产折旧摊销" })] : []),
    ...(error ? [createStatusSection("asset-error", { kind: "error", content: error })] : []),
    ...(!loading && !error ? buildViewSections({ view: activeView, workspace, cards, periodRows, page, pageSize, canEdit: canUpdate, saving, onEdit: (card) => setEditingAssetDraft(editAssetDraft(card)) }) : []),
    ...(activeView === "cards" ? [assetCreateSection()] : []),
    ...(editingAssetDraft ? [assetEditModalSection()] : []),
    ...(activeView === "adjustments" ? [adjustmentCreateSection()] : []),
  ];

  return <PageSurface kind="standard" tabbar={navigation} toolbar={{ items: toolbarItems }} body={createPageBody(sections)} footer={{ pagination: { page, totalPages, total, onPageChange: setPage } }} />;

  function assetCreateSection(): BodySurfaceSectionSpec {
    return { key: "asset-create", chrome: "plain", body: { kind: "create", create: {
      id: "finance-asset-create", trigger: "toolbar", presentation: "modal", title: "新建资产卡片", open: Boolean(assetDraft), canCreate, disabled: saving,
      content: { kind: "sections", sections: assetFormSections(assetDraft ?? emptyAssetDraft(companyCode), (key, value) => setAssetDraft((current) => ({ ...(current ?? emptyAssetDraft(companyCode)), [key]: value }) as CreateFinanceAssetCardInput)) },
      submission: { action: "save", disabled: saving || !assetDraft?.assetCode || !assetDraft.name || !assetDraft.assetAccountCode, execute: saveAsset },
      onOpenChange: (open) => setAssetDraft(open ? emptyAssetDraft(companyCode) : null), onCancel: () => setAssetDraft(null),
    } } };
  }

  function adjustmentCreateSection(): BodySurfaceSectionSpec {
    return { key: "asset-adjustment-create", chrome: "plain", body: { kind: "create", create: {
      id: "finance-asset-adjustment-create", trigger: "toolbar", presentation: "modal", title: "补录调整事项", open: Boolean(adjustmentDraft), canCreate: canRevise, disabled: saving,
      content: { kind: "sections", sections: adjustmentFormSections(adjustmentDraft ?? emptyAdjustmentDraft(companyCode, Number(year), Number(month)), workspace?.cards ?? [], (key, value) => setAdjustmentDraft((current) => ({ ...(current ?? emptyAdjustmentDraft(companyCode, Number(year), Number(month))), [key]: value }) as CreateFinanceAssetAdjustmentInput)) },
      submission: { action: "save", disabled: saving || !adjustmentDraft?.accountCode || !adjustmentDraft.reason || adjustmentDraft.amount === 0, execute: saveAdjustment },
      onOpenChange: (open) => setAdjustmentDraft(open ? emptyAdjustmentDraft(companyCode, Number(year), Number(month)) : null), onCancel: () => setAdjustmentDraft(null),
    } } };
  }

  function assetEditModalSection(): BodySurfaceSectionSpec {
    const draft = editingAssetDraft!;
    const formSections = assetFormSections(draft, (key, value) => setEditingAssetDraft((current) => current ? ({ ...current, [key]: value } as UpdateFinanceAssetCardInput) : null));
    return {
      key: "asset-edit-modal-host",
      chrome: "plain",
      body: { kind: "section", modals: [{
        key: "asset-edit-modal",
        open: true,
        title: "编辑资产卡片",
        size: "lg",
        onClose: () => setEditingAssetDraft(null),
        sections: formSections.map((section) => createFieldsSection(`asset-edit-${section.key}`, section.items, { layout: section.layout, header: section.title ? { title: section.title } : undefined })),
        actions: [
          { key: "cancel", label: "取消", onClick: () => setEditingAssetDraft(null), disabled: saving },
          { key: "save", label: saving ? "保存中..." : "保存", icon: "save", variant: "primary", onClick: () => void saveAssetEdit(), disabled: saving || !draft.assetCode || !draft.name || !draft.assetAccountCode },
        ],
      }] },
    };
  }
}

function buildViewSections({ view, workspace, cards, periodRows, page, pageSize, canEdit, saving, onEdit }: {
  view: AssetView;
  workspace: FinanceAssetWorkspaceDto | null;
  cards: FinanceAssetWorkspaceDto["cards"];
  periodRows: FinanceAssetWorkspaceDto["periodRows"];
  page: number;
  pageSize: number;
  canEdit: boolean;
  saving: boolean;
  onEdit: (card: FinanceAssetCardDto) => void;
}): BodySurfaceSectionSpec[] {
  if (!workspace) return [createStatusSection("asset-empty-scope", { kind: "empty", content: "请选择公司、年度和月份" })];
  const pageRows = <T,>(rows: T[]) => rows.slice((page - 1) * pageSize, page * pageSize);
  if (view === "cards") return [
    createPageTableSection("asset-cards", { rows: pageRows(cards), columns: assetCardColumns, visibleColumns: assetCardColumns.map((column) => column.key), rowKey: (row) => row.id, emptyText: "暂无资产卡片", presentation: { density: "compact" }, scroll: { x: true }, rowActions: canEdit ? (row) => [{ key: "edit", kind: "edit", label: "编辑资产", disabled: saving, onClick: () => onEdit(row) }] : undefined }),
  ];
  if (view === "period") return [
    createMessageSection("asset-period-rule", { tone: "muted", content: "正常折旧/摊销由资产卡片政策计算；补录金额只进入调整事项，不修改资产原值、期限或未来月份公式。" }),
    createPageTableSection("asset-period-rows", { rows: pageRows(periodRows), columns: assetPeriodColumns, visibleColumns: assetPeriodColumns.map((column) => column.key), rowKey: (row) => row.assetId, emptyText: "本期尚未生成折旧摊销", presentation: { density: "compact" }, scroll: { x: true } }),
  ];
  if (view === "adjustments") return [
    createPageTableSection("asset-adjustments", { rows: pageRows(workspace.adjustments), columns: assetAdjustmentColumns, visibleColumns: assetAdjustmentColumns.map((column) => column.key), rowKey: (row) => row.id, emptyText: "暂无调整事项", presentation: { density: "compact" } }),
  ];
  return [
    createPageTableSection("asset-reconciliation", { rows: pageRows(workspace.reconciliation), columns: assetReconciliationColumns, visibleColumns: assetReconciliationColumns.map((column) => column.key), rowKey: (row) => row.accountCode, emptyText: "本期暂无可勾稽数据", presentation: { density: "compact" } }),
  ];
}

function isAssetView(value: unknown): value is AssetView {
  return value === "cards" || value === "period" || value === "adjustments" || value === "reconciliation";
}

function errorMessage(value: unknown, fallback: string) {
  return value && typeof value === "object" && "error" in value && typeof value.error === "string" ? value.error : fallback;
}

function periodStateText(workspace: FinanceAssetWorkspaceDto | null) {
  if (!workspace?.scope.periodId) return "当前期间：未创建";
  return workspace.scope.isClosed ? "当前期间：已关账 · 调整需单独留痕" : "当前期间：未关账";
}

async function postJson(path: string, body: unknown) {
  return sendJson(path, "POST", body);
}

async function putJson(path: string, body: unknown) {
  return sendJson(path, "PUT", body);
}

async function sendJson(path: string, method: "POST" | "PUT", body: unknown) {
  const response = await fetch(workspacePath(path), { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorMessage(data, `操作失败 (${response.status})`));
  return data;
}
