"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import { matchSearchFields } from "@workspace/platform/search";
import { PageSurface, createEmptySection, createFieldsSection, createMasterDetailBody, createPageBody, createPageTabBar, createStatusSection, useFeedback, type BodySurfaceSectionSpec, type FormSurfaceSectionSpec, type SurfaceToolbarItems } from "@workspace/core/ui";
import type { ConfirmFinanceAssetImpairmentAssessmentInput, ConfirmFinanceAssetDisposalInput, CreateFinanceAssetCardInput, DeleteFinanceAssetCategoryPolicyInput, FinanceAssetCardDto, FinanceAssetWorkspaceDto, LinkFinanceAssetPeriodVoucherInput, UpdateFinanceAssetCategoryPolicyInput, UpdateFinanceAssetCardInput } from "../../types/assets";
import type { SessionUser } from "@workspace/platform/types";
import { useFinanceFilterToolbarItems } from "../components/FinanceFilters";
import { getFinanceLifecycleBlocks, getFinancePageViewTabs } from "../components/finance-page-spec";
import type { FinanceLedgerDefaultScope } from "../ledger/defaultScope";
import { disposalFormSections, assetFormSections, emptyAssetDraft, emptyDisposalDraft, editAssetDraft, formatFinanceAmount, impairmentAssessmentDraft, impairmentAssessmentFormSections, periodVoucherLinkDraft, periodVoucherLinkFormSections, KIND_LABELS } from "./assetScheduleUi";
import { useAssetExportAction } from "./useAssetExportAction";
import { useAssetPolicyWorkbench } from "./useAssetPolicyWorkbench";
import { useAssetCodePreview } from "./useAssetCodePreview";
import { createLatestRequestGate, financeUiRequestScopeKey, financeUiResponseMatchesScope, type FinanceUiRequestScope } from "../components/latest-request-gate";
import { assetLocationFromSearch, assetLocationSearch, type AssetPolicyScope, type AssetWorkspaceView } from "./asset-location";
import { applyAssetCategorySelection, assetDraftDisplayValues, assetPeriodDraftMatchesScope, assetViewLabel, assetViewShowsCompanyFilter, buildAssetViewSections, categoryHasAccountPolicy, createAssetCardSelector, deleteJson, errorMessage, firstAssetView, firstPolicyScope, isAbortError, isAssetPolicyScope, isAssetView, periodStateText, postJson, putJson } from "./asset-client-model";

type AssetView = AssetWorkspaceView;
type AssetsClientProps = { canCreate: boolean; canUpdate: boolean; canRevise: boolean; canExport: boolean; defaultScope: FinanceLedgerDefaultScope | null; user: SessionUser };
export default function AssetsClient({ canCreate, canUpdate, canRevise, canExport, defaultScope, user }: AssetsClientProps) {
  const viewTabs = useMemo(() => getFinancePageViewTabs("assets", user), [user]);
  const [activeView, setActiveView] = useState<AssetView>(() => firstAssetView(viewTabs));
  const [activePolicyScope, setActivePolicyScope] = useState<AssetPolicyScope>(() => firstPolicyScope(viewTabs));
  const lifecycleBlocks = getFinanceLifecycleBlocks("assets");
  const navigation = viewTabs.length > 1 ? createPageTabBar({
    items: viewTabs,
    active: activeView,
    activeChild: activeView === "policies" ? activePolicyScope : undefined,
    onChange: (key) => {
      if (!isAssetView(key) || !viewTabs.some((item) => item.key === key)) return;
      setActiveView(key);
      window.history.replaceState(null, "", assetLocationSearch({ view: key, policyScope: activePolicyScope, companyCode, year, month }));
    },
    onChildChange: (key) => {
      if (!isAssetPolicyScope(key)) return;
      setActivePolicyScope(key);
      window.history.replaceState(null, "", assetLocationSearch({ view: "policies", policyScope: key, companyCode, year, month }));
    },
  }) : undefined;
  const [companyCode, setCompanyCode] = useState(defaultScope?.companyCode ?? "");
  const [year, setYear] = useState(String(defaultScope?.year ?? ""));
  const [month, setMonth] = useState(String(defaultScope?.month ?? ""));
  const [keyword, setKeyword] = useState("");
  const [workspace, setWorkspace] = useState<FinanceAssetWorkspaceDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assetDraft, setAssetDraft] = useState<CreateFinanceAssetCardInput | null>(null);
  const [editingAssetDraft, setEditingAssetDraft] = useState<UpdateFinanceAssetCardInput | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
  const [assetDetailOpen, setAssetDetailOpen] = useState(false);
  const [assetDirty, setAssetDirty] = useState(false);
  const [impairmentDraft, setImpairmentDraft] = useState<ConfirmFinanceAssetImpairmentAssessmentInput | null>(null);
  const [disposalDraft, setDisposalDraft] = useState<ConfirmFinanceAssetDisposalInput | null>(null);
  const [periodVoucherDraft, setPeriodVoucherDraft] = useState<LinkFinanceAssetPeriodVoucherInput | null>(null);
  const [periodVoucherOpen, setPeriodVoucherOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [saving, setSaving] = useState(false);
  const [loadGate] = useState(createLatestRequestGate);
  const [mutationGate] = useState(createLatestRequestGate);
  const requestScope = useMemo<FinanceUiRequestScope | null>(() => {
    const nextYear = Number(year);
    const nextMonth = Number(month);
    return companyCode && Number.isInteger(nextYear) && Number.isInteger(nextMonth)
      ? { companyCode, year: nextYear, month: nextMonth }
      : null;
  }, [companyCode, month, year]);
  const assetCodePreview = useAssetCodePreview(assetDraft, setAssetDraft);
  const feedback = useFeedback({ unsavedChanges: assetDirty });
  const exportAction = useAssetExportAction({
    canExport: canExport && activeView !== "policies",
    view: activeView === "policies" ? "cards" : activeView,
    companyCode,
    year,
    month,
    keyword,
    disabled: !companyCode || !year || !month,
    fallbackFilename: `${companyCode || "公司"}-${year || "年度"}.${month.padStart(2, "0")}-${assetViewLabel(activeView)}.xlsx`,
  });

  const load = useCallback(async (requestedScope: FinanceUiRequestScope | null = requestScope) => {
    if (!requestedScope) {
      loadGate.invalidate();
      setWorkspace(null);
      setImpairmentDraft(null);
      setPeriodVoucherDraft(null);
      return null;
    }
    const ticket = loadGate.begin(financeUiRequestScopeKey(requestedScope));
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ companyCode: requestedScope.companyCode, year: String(requestedScope.year), month: String(requestedScope.month) });
      const response = await fetch(workspacePath(`/api/modules/finance/assets?${params.toString()}`), { signal: ticket.signal });
      const data = await response.json().catch(() => null) as FinanceAssetWorkspaceDto | { error?: string } | null;
      if (!response.ok) throw new Error(errorMessage(data, `加载失败 (${response.status})`));
      const nextWorkspace = data as FinanceAssetWorkspaceDto;
      if (!financeUiResponseMatchesScope(nextWorkspace.scope, requestedScope)) throw new Error("资产工作区返回了不一致的公司或会计期间");
      if (!loadGate.isCurrent(ticket)) return null;
      setWorkspace(nextWorkspace);
      setImpairmentDraft(impairmentAssessmentDraft(requestedScope.companyCode, requestedScope.year, requestedScope.month, nextWorkspace.impairmentAssessment));
      setPeriodVoucherDraft(periodVoucherLinkDraft(requestedScope.companyCode, requestedScope.year, requestedScope.month, nextWorkspace.periodVoucherLink.linkFingerprint));
      return nextWorkspace;
    } catch (caught) {
      if (!loadGate.isCurrent(ticket) || isAbortError(caught)) return null;
      setWorkspace(null);
      setError(caught instanceof Error ? caught.message : "资产折旧摊销加载失败");
      return null;
    } finally {
      if (loadGate.isCurrent(ticket)) setLoading(false);
    }
  }, [loadGate, requestScope]);

  useEffect(() => { void load(requestScope); return () => loadGate.invalidate(); }, [load, loadGate, requestScope]);
  const invalidateAssetScope = useCallback(() => {
    loadGate.invalidate();
    mutationGate.invalidate();
    setWorkspace(null);
    setError(null);
    setLoading(false);
    setSaving(false);
    setImpairmentDraft(null);
    setDisposalDraft(null);
    setPeriodVoucherDraft(null);
    setPeriodVoucherOpen(false);
    resetAssetSelection();
  }, [loadGate, mutationGate]);

  useEffect(() => {
    const applyLocation = () => {
      const allowedViews = viewTabs.flatMap((item) => isAssetView(item.key) ? [item.key] : []);
      const location = assetLocationFromSearch(window.location.search, allowedViews);
      invalidateAssetScope();
      if (location.view) setActiveView(location.view);
      if (location.policyScope) setActivePolicyScope(location.policyScope);
      if (location.companyCode) setCompanyCode(location.companyCode);
      if (location.year) setYear(String(location.year));
      if (location.month) setMonth(String(location.month));
    };
    applyLocation();
    window.addEventListener("popstate", applyLocation);
    return () => window.removeEventListener("popstate", applyLocation);
  }, [invalidateAssetScope, viewTabs]);

  async function saveAsset() {
    if (!assetDraft || !requestScope || assetDraft.companyCode !== requestScope.companyCode || assetDraft.accountYear !== requestScope.year) return;
    const ticket = mutationGate.begin(financeUiRequestScopeKey(requestScope));
    setSaving(true);
    try {
      const created = await postJson<{ id: number }>("/api/modules/finance/assets", assetDraft, ticket.signal);
      if (!mutationGate.isCurrent(ticket)) return;
      setAssetDraft(null);
      const refreshed = await load(requestScope);
      if (!mutationGate.isCurrent(ticket)) return;
      const createdCard = refreshed?.cards.find((card) => card.id === created.id) ?? null;
      if (createdCard) {
        setSelectedAssetId(createdCard.id);
        setEditingAssetDraft(editAssetDraft(createdCard, Number(year)));
        setAssetDirty(false);
        setAssetDetailOpen(true);
      }
      return { outcome: "saved" as const, message: "资产卡片已创建" };
    } catch (caught) {
      if (!mutationGate.isCurrent(ticket) || isAbortError(caught)) return;
      throw caught;
    } finally {
      if (mutationGate.isCurrent(ticket)) setSaving(false);
    }
  }

  async function saveImpairmentAssessment() {
    if (!impairmentDraft || !requestScope || !assetPeriodDraftMatchesScope(impairmentDraft, requestScope)) return;
    const ticket = mutationGate.begin(financeUiRequestScopeKey(requestScope));
    setSaving(true);
    try {
      await putJson("/api/modules/finance/assets/impairment-assessment", impairmentDraft, ticket.signal);
      if (!mutationGate.isCurrent(ticket)) return;
      await load(requestScope);
      if (!mutationGate.isCurrent(ticket)) return;
      feedback.success("本期资产减值评估已确认");
    } catch (caught) {
      if (!mutationGate.isCurrent(ticket) || isAbortError(caught)) return;
      feedback.error(caught instanceof Error ? caught.message : "减值评估确认失败");
    } finally {
      if (mutationGate.isCurrent(ticket)) setSaving(false);
    }
  }

  async function saveDisposal() {
    if (!disposalDraft || !requestScope || !assetPeriodDraftMatchesScope(disposalDraft, requestScope)) return;
    const ticket = mutationGate.begin(financeUiRequestScopeKey(requestScope));
    setSaving(true);
    try {
      await postJson("/api/modules/finance/assets/disposals", disposalDraft, ticket.signal);
      if (!mutationGate.isCurrent(ticket)) return;
      setDisposalDraft(null);
      await load(requestScope);
      if (!mutationGate.isCurrent(ticket)) return;
      return { outcome: "saved" as const, message: "资产处置已确认" };
    } catch (caught) {
      if (!mutationGate.isCurrent(ticket) || isAbortError(caught)) return;
      throw caught;
    } finally {
      if (mutationGate.isCurrent(ticket)) setSaving(false);
    }
  }

  async function savePeriodVoucherLink() {
    if (!periodVoucherDraft || !requestScope || !assetPeriodDraftMatchesScope(periodVoucherDraft, requestScope)) return;
    const ticket = mutationGate.begin(financeUiRequestScopeKey(requestScope));
    setSaving(true);
    try {
      await putJson("/api/modules/finance/assets/periods/voucher-link", periodVoucherDraft, ticket.signal);
      if (!mutationGate.isCurrent(ticket)) return;
      setPeriodVoucherOpen(false);
      await load(requestScope);
      if (!mutationGate.isCurrent(ticket)) return;
      return { outcome: "saved" as const, message: "折旧摊销专用凭证已关联" };
    } catch (caught) {
      if (!mutationGate.isCurrent(ticket) || isAbortError(caught)) return;
      throw caught;
    } finally {
      if (mutationGate.isCurrent(ticket)) setSaving(false);
    }
  }

  async function saveAssetEdit() {
    if (!editingAssetDraft || !requestScope || editingAssetDraft.companyCode !== requestScope.companyCode || editingAssetDraft.accountYear !== requestScope.year) return;
    const ticket = mutationGate.begin(financeUiRequestScopeKey(requestScope));
    setSaving(true);
    try {
      await putJson("/api/modules/finance/assets", editingAssetDraft, ticket.signal);
      if (!mutationGate.isCurrent(ticket)) return;
      const refreshed = await load(requestScope);
      if (!mutationGate.isCurrent(ticket)) return;
      const updatedCard = refreshed?.cards.find((card) => card.id === editingAssetDraft.id) ?? null;
      setSelectedAssetId(updatedCard?.id ?? editingAssetDraft.id);
      setEditingAssetDraft(updatedCard ? editAssetDraft(updatedCard, Number(year)) : null);
      setAssetDirty(false);
      feedback.success("资产卡片已更新；如计算政策有变化，请重新计算开放期间");
    } catch (caught) {
      if (!mutationGate.isCurrent(ticket) || isAbortError(caught)) return;
      feedback.error(caught instanceof Error ? caught.message : "资产卡片更新失败");
    } finally {
      if (mutationGate.isCurrent(ticket)) setSaving(false);
    }
  }

  async function recalculate() {
    if (!requestScope) return;
    const ticket = mutationGate.begin(financeUiRequestScopeKey(requestScope));
    setSaving(true);
    try {
      await postJson("/api/modules/finance/assets/periods/recalculate", requestScope, ticket.signal);
      if (!mutationGate.isCurrent(ticket)) return;
      await load(requestScope);
      if (!mutationGate.isCurrent(ticket)) return;
      feedback.success("本期折旧摊销已重新计算");
    } catch (caught) {
      if (!mutationGate.isCurrent(ticket) || isAbortError(caught)) return;
      feedback.error(caught instanceof Error ? caught.message : "重新计算失败");
    } finally {
      if (mutationGate.isCurrent(ticket)) setSaving(false);
    }
  }

  const cards = useMemo(() => (workspace?.cards ?? []).filter((row) => matchSearchFields(row, keyword, ["assetCode", "name", "categoryName", "assetAccountCode"])), [keyword, workspace?.cards]);
  const periodRows = useMemo(() => (workspace?.periodRows ?? []).filter((row) => matchSearchFields(row, keyword, ["assetCode", "name", "accountCode"])), [keyword, workspace?.periodRows]);
  const selectedAsset = workspace?.cards.find((card) => card.id === selectedAssetId) ?? null;
  const saveAssetPolicy = useCallback(async (draft: UpdateFinanceAssetCategoryPolicyInput) => {
    if (!requestScope || draft.companyCode !== requestScope.companyCode || draft.year !== requestScope.year) return null;
    const ticket = mutationGate.begin(financeUiRequestScopeKey(requestScope));
    setSaving(true);
    try {
      await putJson("/api/modules/finance/assets/policies", draft, ticket.signal);
      if (!mutationGate.isCurrent(ticket)) return null;
      return await load(requestScope);
    } catch (caught) {
      if (!mutationGate.isCurrent(ticket) || isAbortError(caught)) return null;
      throw caught;
    } finally {
      if (mutationGate.isCurrent(ticket)) setSaving(false);
    }
  }, [load, mutationGate, requestScope]);
  const resetAssetPolicy = useCallback(async (input: DeleteFinanceAssetCategoryPolicyInput) => {
    if (!requestScope || input.companyCode !== requestScope.companyCode || input.year !== requestScope.year) return null;
    const ticket = mutationGate.begin(financeUiRequestScopeKey(requestScope));
    setSaving(true);
    try {
      await deleteJson("/api/modules/finance/assets/policies", input, ticket.signal);
      if (!mutationGate.isCurrent(ticket)) return null;
      return await load(requestScope);
    } catch (caught) {
      if (!mutationGate.isCurrent(ticket) || isAbortError(caught)) return null;
      throw caught;
    } finally {
      if (mutationGate.isCurrent(ticket)) setSaving(false);
    }
  }, [load, mutationGate, requestScope]);
  const policyWorkbench = useAssetPolicyWorkbench({ canUpdate, policyScope: activePolicyScope, companyCode, year, keyword, workspace, loading, error, lifecycleBlocks, savePolicy: saveAssetPolicy, resetPolicy: resetAssetPolicy });
  const total = activeView === "cards" ? cards.length : activeView === "policies" ? policyWorkbench.total : activeView === "period" ? periodRows.length : workspace?.adjustments.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => { setPage(1); }, [activeView, companyCode, keyword, month, pageSize, year]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  useEffect(() => {
    if (!workspace || assetDirty) return;
    const next = workspace.cards.find((card) => card.id === selectedAssetId) ?? workspace.cards[0] ?? null;
    setSelectedAssetId(next?.id ?? null);
    setEditingAssetDraft(next ? editAssetDraft(next, Number(year)) : null);
  }, [assetDirty, selectedAssetId, workspace, year]);
  const extraItems: SurfaceToolbarItems = [
    ...(activeView === "period" && canRevise ? [{ kind: "action-group" as const, key: "asset-period-actions", actions: [{ key: "recalculate", kind: "refresh" as const, label: "重新计算", disabled: saving || workspace?.scope.isClosed, onClick: () => void recalculate() }] }] : []),
    ...(activeView === "cards" || activeView === "policies" ? [] : [{ kind: "text" as const, key: "asset-period-state", content: periodStateText(workspace) }]),
    ...(exportAction ? [exportAction] : []),
  ];
  const toolbarItems = useFinanceFilterToolbarItems({
    companyFilter: companyCode,
    yearFilter: year,
    monthFilter: month,
    keyword,
    pageSize,
    onCompanyChange: assetViewShowsCompanyFilter(activeView, activePolicyScope)
      ? (value) => { invalidateAssetScope(); setCompanyCode(value); window.history.replaceState(null, "", assetLocationSearch({ view: activeView, policyScope: activePolicyScope, companyCode: value, year, month })); }
      : undefined,
    onYearChange: (value) => { invalidateAssetScope(); setYear(value); window.history.replaceState(null, "", assetLocationSearch({ view: activeView, policyScope: activePolicyScope, companyCode, year: value, month })); },
    onMonthChange: (value) => { invalidateAssetScope(); setMonth(value); window.history.replaceState(null, "", assetLocationSearch({ view: activeView, policyScope: activePolicyScope, companyCode, year, month: value })); },
    onKeywordChange: setKeyword,
    onPageSizeChange: setPageSize,
    showMonth: activeView !== "policies",
    showPageSize: activeView !== "policies",
    extraItems,
  });
  const standardSections = [
    ...lifecycleBlocks,
    ...(loading ? [createStatusSection("asset-loading", { kind: "loading", content: "正在加载资产折旧摊销" })] : []),
    ...(error ? [createStatusSection("asset-error", { kind: "error", content: error })] : []),
    ...(!loading && !error && activeView !== "cards" && activeView !== "policies" ? buildAssetViewSections({ view: activeView, workspace, periodRows, page, pageSize }) : []),
    ...(activeView === "adjustments" && impairmentDraft ? [impairmentAssessmentSection()] : []),
    ...(activeView === "adjustments" ? [disposalCreateSection()] : []),
    ...(activeView === "period" && periodVoucherDraft ? [periodVoucherLinkSection()] : []),
  ];

  const body = activeView === "cards" ? assetCardsBody() : activeView === "policies" ? policyWorkbench.body : createPageBody(standardSections);

  return <PageSurface kind="standard" tabbar={navigation} toolbar={{ items: toolbarItems }} body={body} footer={activeView === "cards" || activeView === "policies" ? undefined : { pagination: { page, totalPages, total, onPageChange: setPage } }} />;

  function assetCardsBody() {
    const selector = createAssetCardSelector({ cards, page, pageSize, selectedAssetId, loading, error, workspace, onSelect: (card) => { void selectAsset(card); } });
    const detailSections = [
      ...lifecycleBlocks,
      assetCreateSection(),
      ...(assetDraft ? [] : loading
        ? [createStatusSection("asset-card-loading", { kind: "loading", content: "正在加载资产卡片" })]
        : error
          ? [createStatusSection("asset-card-error", { kind: "error", content: error })]
          : [assetDetailSection()]),
    ];

    return createMasterDetailBody({ master: { label: "资产卡片", presentation: "compact", body: { kind: "selector", selector }, footer: { pagination: { page, totalPages, total, onPageChange: setPage, compact: true } } }, detail: createPageBody(detailSections), desktop: { ratio: [1, 2] }, mobile: { detailActive: assetDetailOpen, onNavigateToList: () => setAssetDetailOpen(false) } });
  }

  function assetCreateSection(): BodySurfaceSectionSpec {
    const draft = assetDraft ?? emptyAssetDraft(companyCode, Number(year));
    return { key: "asset-create", body: { kind: "create", create: {
      id: "finance-asset-create", trigger: "toolbar", presentation: "block", title: "新建资产卡片", open: Boolean(assetDraft), canCreate: canCreate && Boolean(companyCode), disabled: saving || !companyCode,
      content: { kind: "sections", sections: assetFormSections(draft, updateNewAssetDraft, false, { ...assetDraftDisplayValues(draft, workspace, null), assetCodePlaceholder: assetCodePreview.loading ? "正在生成..." : assetCodePreview.error ? "编码规则不可用" : "选择资产分类后生成" }) },
      submission: { action: "save", disabled: saving || assetCodePreview.loading || Boolean(assetCodePreview.error) || !assetDraft?.assetCode || !assetDraft.idempotencyKey || !assetDraft.name || !categoryHasAccountPolicy(assetDraft, workspace), execute: saveAsset },
      onOpenChange: (open) => { setAssetDraft(open ? emptyAssetDraft(companyCode, Number(year)) : null); if (open) setAssetDetailOpen(true); },
      onCancel: () => setAssetDraft(null),
    } } };
  }

  function disposalCreateSection(): BodySurfaceSectionSpec {
    return { key: "asset-disposal-create", body: { kind: "create", create: {
      id: "finance-asset-disposal-create", trigger: "toolbar", presentation: "modal", title: "确认资产处置", open: Boolean(disposalDraft), canCreate: canRevise, disabled: saving || Boolean(workspace?.scope.isClosed),
      content: { kind: "sections", sections: disposalFormSections(disposalDraft ?? emptyDisposalDraft(companyCode, Number(year), Number(month)), workspace?.cards ?? [], (key, value) => setDisposalDraft((current) => ({ ...(current ?? emptyDisposalDraft(companyCode, Number(year), Number(month))), [key]: value }) as ConfirmFinanceAssetDisposalInput)) },
      submission: { action: "save", disabled: saving || !disposalDraft?.assetId || !disposalDraft.disposalDate || !disposalDraft.voucherNo || !disposalDraft.evidenceRef || !disposalDraft.reason, execute: saveDisposal },
      onOpenChange: (open) => setDisposalDraft(open ? emptyDisposalDraft(companyCode, Number(year), Number(month)) : null), onCancel: () => setDisposalDraft(null),
    } } };
  }

  function periodVoucherLinkSection(): BodySurfaceSectionSpec {
    const draft = periodVoucherDraft!;
    return { key: "asset-period-voucher-link", body: { kind: "create", create: {
      id: "finance-asset-period-voucher-link", trigger: "toolbar", presentation: "modal", title: "关联折旧摊销专用凭证", open: periodVoucherOpen, canCreate: canRevise, disabled: saving || Boolean(workspace?.scope.isClosed),
      content: { kind: "sections", sections: periodVoucherLinkFormSections(draft, (voucherNo) => setPeriodVoucherDraft((current) => current ? { ...current, voucherNo } : current)) },
      submission: { action: "save", disabled: saving || !draft.voucherNo, execute: savePeriodVoucherLink },
      onOpenChange: (open) => { setPeriodVoucherOpen(open); if (open) setPeriodVoucherDraft(periodVoucherLinkDraft(companyCode, Number(year), Number(month), workspace?.periodVoucherLink.linkFingerprint ?? draft.expectedLinkFingerprint)); },
      onCancel: () => { setPeriodVoucherOpen(false); setPeriodVoucherDraft((current) => current ? { ...current, voucherNo: "" } : current); },
    } } };
  }

  function impairmentAssessmentSection(): BodySurfaceSectionSpec {
    const draft = impairmentDraft!;
    const formSections = impairmentAssessmentFormSections(draft, updateImpairmentDraft, !canRevise || Boolean(workspace?.scope.isClosed), workspace?.cards ?? [])
      .map<FormSurfaceSectionSpec>((section) => ({ kind: "section", ...section, chrome: "divider" }));
    const recorded = draft.conclusion === "impairment_recorded";
    return createFieldsSection("asset-impairment-assessment", formSections, {
      kind: canRevise ? "fields" : "detail",
      header: {
        title: "资产减值评估",
        description: workspace?.impairmentAssessment
          ? `已确认 · 资产范围 ${workspace.impairmentAssessment.assetCount} 项`
          : "确认后纳入本期关账证据",
      },
      actions: canRevise ? [{
        key: "save-impairment-assessment",
        action: "save",
        label: saving ? "保存中..." : "确认评估",
        disabled: saving || Boolean(workspace?.scope.isClosed) || !draft.basis || !draft.evidenceRef
          || (recorded && (draft.impairmentAmount <= 0 || !draft.voucherNo
            || Math.abs(draft.allocations.reduce((sum, row) => sum + row.amount, 0) - draft.impairmentAmount) > 0.01)),
        onClick: () => void saveImpairmentAssessment(),
      }] : [],
      submit: canRevise ? { onSubmit: () => void saveImpairmentAssessment() } : undefined,
    });
  }

  function updateImpairmentDraft(key: keyof ConfirmFinanceAssetImpairmentAssessmentInput, value: unknown) {
    setImpairmentDraft((current) => {
      if (!current) return current;
      if (key === "conclusion") {
        const conclusion = String(value) as ConfirmFinanceAssetImpairmentAssessmentInput["conclusion"];
        return conclusion === "impairment_recorded"
          ? { ...current, conclusion }
          : { ...current, conclusion, impairmentAmount: 0, voucherNo: null, allocations: [] };
      }
      return { ...current, [key]: value };
    });
  }

  function assetDetailSection(): BodySurfaceSectionSpec {
    if (!selectedAsset || !editingAssetDraft) return createEmptySection("asset-card-empty", { content: "从左侧选择资产卡片查看详情", presentation: "card" });
    const formSections = assetFormSections(editingAssetDraft, updateAssetDraft, !canUpdate, assetDraftDisplayValues(editingAssetDraft, workspace, selectedAsset)).map<FormSurfaceSectionSpec>((section) => ({ kind: "section", ...section, chrome: "divider" }));
    return createFieldsSection("asset-card-detail", formSections, {
      kind: canUpdate ? "fields" : "detail",
      header: { title: selectedAsset.name, description: `${selectedAsset.assetCode} · ${KIND_LABELS[selectedAsset.assetKind]} · 原值 ${formatFinanceAmount(selectedAsset.originalCost)}` },
      actions: canUpdate ? [
        { key: "reset", action: "reset", label: "撤销修改", disabled: saving || !assetDirty, onClick: resetAssetEdit },
        { key: "save", action: "save", label: saving ? "保存中..." : "保存", disabled: saving || !assetDirty || !editingAssetDraft.assetCode || !editingAssetDraft.name || !categoryHasAccountPolicy(editingAssetDraft, workspace), onClick: () => void saveAssetEdit() },
      ] : [],
      submit: canUpdate ? { onSubmit: () => void saveAssetEdit() } : undefined,
    });
  }

  function updateAssetDraft(key: keyof CreateFinanceAssetCardInput, value: unknown) {
    if (!canUpdate) return;
    setEditingAssetDraft((current) => current
      ? applyAssetCategorySelection(current, key, value, workspace?.categories ?? []) as UpdateFinanceAssetCardInput
      : null);
    setAssetDirty(true);
  }

  function updateNewAssetDraft(key: keyof CreateFinanceAssetCardInput, value: unknown) {
    setAssetDraft((current) => applyAssetCategorySelection(
      current ?? emptyAssetDraft(companyCode, Number(year)),
      key,
      value,
      workspace?.categories ?? [],
    ));
  }

  function resetAssetEdit() {
    if (!selectedAsset) return;
    setEditingAssetDraft(editAssetDraft(selectedAsset, Number(year)));
    setAssetDirty(false);
  }

  async function selectAsset(card: FinanceAssetCardDto) {
    if (card.id === selectedAssetId) {
      setAssetDetailOpen(true);
      return;
    }
    if (assetDirty && !await feedback.confirmLeave()) return;
    setSelectedAssetId(card.id);
    setEditingAssetDraft(editAssetDraft(card, Number(year)));
    setAssetDirty(false);
    setAssetDetailOpen(true);
  }

  function resetAssetSelection() {
    setAssetDraft(null);
    setEditingAssetDraft(null);
    setSelectedAssetId(null);
    setAssetDetailOpen(false);
    setAssetDirty(false);
  }

}
