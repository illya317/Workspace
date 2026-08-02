"use client";

import { workspacePath } from "@workspace/core/routing";
import {
  PageSurface,
  createAnalysisSection,
  createEmptySection,
  createFieldsSection,
  createMessageSection,
  createPageBody,
  createPageTabBar,
  createStatusSection,
  useFeedback,
  type BodySurfaceSectionSpec,
  type PageSurfaceCreateSpec,
} from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { FinanceLedgerDefaultScope } from "../ledger/defaultScope";
import { useFinanceFilterToolbarItems } from "../components/FinanceFilters";
import { getFinanceLifecycleBlocks, getFinancePageViewTabs } from "../components/finance-page-spec";
import {
  createLatestRequestGate,
  financeUiRequestScopeKey,
  financeUiResponseMatchesScope,
  type FinanceUiRequestScope,
} from "../components/latest-request-gate";
import type { TaxWorkspaceDto } from "../../types/tax";
import { taxDraftFormItems, taxDraftFormSections } from "./tax-ui-forms";
import {
  buildTaxWriteInput,
  createAccrualLineDraft,
  createAllocationDraft,
  createTaxDraft,
  draftIsValid,
  editFilingDraft,
  editRegistrationDraft,
  editWorkpaperDraft,
  type AccrualLineDraft,
  type AllocationDraft,
  type TaxDraft,
  type TaxView,
  type TaxWorkspace,
} from "./tax-ui-model";
import { normalizeTaxWorkspace } from "./tax-ui-normalization";
import {
  taxAccrualSections,
  taxFilingPaymentSections,
  taxReconciliationSections,
} from "./tax-ui-sections";

const TAX_VIEW_KEYS: TaxView[] = ["accrual", "filing-payment", "reconciliation-evidence"];

export default function TaxClient({
  canCreate,
  canUpdate,
  defaultScope,
  user,
}: {
  canCreate: boolean;
  canUpdate: boolean;
  defaultScope: FinanceLedgerDefaultScope | null;
  user: SessionUser;
}) {
  const viewTabs = useMemo(
    () => getFinancePageViewTabs("tax", user).filter((item) => isTaxView(item.key)),
    [user],
  );
  const [activeView, setActiveView] = useState<TaxView>(() => firstView(viewTabs));
  const [companyCode, setCompanyCode] = useState(defaultScope?.companyCode ?? "");
  const [year, setYear] = useState(String(defaultScope?.year ?? ""));
  const [month, setMonth] = useState(String(defaultScope?.month ?? ""));
  const [workspace, setWorkspace] = useState<TaxWorkspace | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState<TaxDraft | null>(null);
  const [editDraft, setEditDraft] = useState<TaxDraft | null>(null);
  const feedback = useFeedback({ unsavedChanges: Boolean(createDraft || editDraft) });
  const lifecycleBlocks = getFinanceLifecycleBlocks("tax");
  const requestScope = useMemo(() => taxRequestScope(companyCode, year, month), [companyCode, month, year]);
  const [loadGate] = useState(createLatestRequestGate);
  const [mutationGate] = useState(createLatestRequestGate);
  const scope = useMemo(() => ({
    companyCode,
    year: Number(year),
    month: Number(month),
    periodId: workspace?.scope.periodId ?? null,
  }), [companyCode, month, workspace?.scope.periodId, year]);

  const load = useCallback(async (requestedScope: FinanceUiRequestScope | null) => {
    if (!requestedScope) {
      loadGate.invalidate();
      setWorkspace(null);
      setError(null);
      setLoading(false);
      return null;
    }
    const ticket = loadGate.begin(financeUiRequestScopeKey(requestedScope));
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        companyCode: requestedScope.companyCode,
        year: String(requestedScope.year),
        month: String(requestedScope.month),
      });
      const response = await fetch(workspacePath(`/api/modules/finance/tax?${params.toString()}`), { signal: ticket.signal });
      const data = await response.json().catch(() => null) as TaxWorkspaceDto | { error?: string } | null;
      if (!response.ok) throw new Error(errorMessage(data, `税务工作区加载失败 (${response.status})`));
      const next = normalizeTaxWorkspace(data as TaxWorkspaceDto);
      if (!financeUiResponseMatchesScope(next.scope, requestedScope)) throw new Error("税务工作区返回了不一致的公司或会计期间");
      if (!loadGate.isCurrent(ticket)) return null;
      setWorkspace(next);
      return next;
    } catch (caught) {
      if (!loadGate.isCurrent(ticket) || isAbortError(caught)) return null;
      setWorkspace(null);
      setError(caught instanceof Error ? caught.message : "税务工作区加载失败");
      return null;
    } finally {
      if (loadGate.isCurrent(ticket)) setLoading(false);
    }
  }, [loadGate]);

  useEffect(() => {
    void load(requestScope);
    return () => loadGate.invalidate();
  }, [load, loadGate, requestScope]);

  const resetDrafts = useCallback(() => {
    setCreateDraft(null);
    setEditDraft(null);
  }, []);

  const invalidateScope = useCallback(() => {
    loadGate.invalidate();
    mutationGate.invalidate();
    setWorkspace(null);
    setError(null);
    setLoading(false);
    setSaving(false);
    resetDrafts();
  }, [loadGate, mutationGate, resetDrafts]);

  useEffect(() => {
    const applyLocation = () => {
      const next = taxScopeFromLocation();
      invalidateScope();
      setCompanyCode(next?.companyCode ?? "");
      setYear(next ? String(next.year) : "");
      setMonth(next ? String(next.month) : "");
    };
    window.addEventListener("popstate", applyLocation);
    return () => window.removeEventListener("popstate", applyLocation);
  }, [invalidateScope]);

  const toolbarItems = useFinanceFilterToolbarItems({
    companyFilter: companyCode,
    yearFilter: year,
    monthFilter: month,
    onCompanyChange: (value) => { invalidateScope(); setCompanyCode(value); },
    onYearChange: (value) => { invalidateScope(); setYear(value); },
    onMonthChange: (value) => { invalidateScope(); setMonth(value); },
    showSearch: false,
    showPageSize: false,
    extraItems: [{
      kind: "action-group",
      key: "tax-refresh",
      actions: [{
        key: "refresh",
        kind: "refresh",
        label: "刷新",
        disabled: loading || !companyCode || !year || !month,
        onClick: () => { void load(requestScope); },
      }],
    }],
  });

  const navigation = viewTabs.length > 1 ? createPageTabBar({
    items: viewTabs,
    active: activeView,
    onChange: (key) => { if (isTaxView(key)) setActiveView(key); },
  }) : undefined;

  const sections: BodySurfaceSectionSpec[] = [
    ...lifecycleBlocks,
    ...(loading ? [createStatusSection("tax-loading", { kind: "loading", content: "正在加载税务工作区" })] : []),
    ...(error ? [createStatusSection("tax-error", { kind: "error", content: error })] : []),
    ...(!loading && !error && (!companyCode || !year || !month)
      ? [createEmptySection("tax-scope-empty", { content: "请选择公司和会计期间", presentation: "card" })]
      : []),
    ...(!loading && !error && workspace?.scope.isClosed
      ? [createMessageSection("tax-period-closed", { content: "当前会计期间已关闭，税务事实为只读", tone: "warning" })]
      : []),
    ...(!loading && !error && workspace && activeView !== "reconciliation-evidence" && workspace.blockers.length > 0
      ? [createMessageSection("tax-blockers-summary", { content: `当前期间有 ${workspace.blockers.length} 项关账阻断，请在“勾稽证据”查看`, tone: "warning" })]
      : []),
    ...viewSections(),
  ];
  const editSection = createEditSection();
  const pageCreate = createSpec();

  return (
    <PageSurface
      kind="standard"
      create={editSection ? undefined : pageCreate}
      tabbar={navigation}
      toolbar={{ items: toolbarItems }}
      body={createPageBody(editSection ? [editSection] : sections)}
    />
  );

  function createSpec(): PageSurfaceCreateSpec {
    const draft = createDraft ?? createTaxDraft(defaultCreateKind(activeView, workspace), scope);
    return {
          id: "finance-tax-create",
          presentation: "block",
          title: "新建税务事项",
          open: Boolean(createDraft),
          canCreate,
          disabled: saving || workspace?.scope.isClosed || !companyCode || !year || !month,
          content: { kind: "sections", sections: taxDraftFormSections(formInput(draft, true, setCreateDraft)) },
          submission: {
            action: "save",
            disabled: saving || !draftIsValid(createDraft, workspace?.scope.periodId ?? null),
            execute: saveCreate,
          },
          feedback: { saved: "税务事项已创建", error: "税务事项创建失败" },
          onOpenChange: (open) => setCreateDraft(open ? draft : null),
          onCancel: () => setCreateDraft(null),
    };
  }

  function viewSections(): BodySurfaceSectionSpec[] {
    if (loading || error || !workspace) return [];
    if (activeView === "accrual") return taxAccrualSections({
      workspace,
      canUpdate: canUpdate && !workspace.scope.isClosed,
      onEditRegistration: (row) => setEditDraft(editRegistrationDraft(row)),
      onEditWorkpaper: (row) => setEditDraft(editWorkpaperDraft(row)),
    });
    if (activeView === "filing-payment") return taxFilingPaymentSections({
      workspace,
      canUpdate: canUpdate && !workspace.scope.isClosed,
      onEditFiling: (row) => setEditDraft(editFilingDraft(row)),
    });
    return taxReconciliationSections(workspace);
  }

  function createEditSection() {
    if (!editDraft) return null;
    return createAnalysisSection("tax-edit", {
      title: editTitle(editDraft),
      sections: [createFieldsSection("tax-edit-fields", taxDraftFormItems(formInput(editDraft, false, setEditDraft)), {
        kind: "fields",
        actions: [
          { key: "cancel", action: "cancel", label: "取消", disabled: saving, onClick: () => setEditDraft(null) },
          { key: "save", action: "save", label: saving ? "保存中..." : "保存", disabled: saving || !draftIsValid(editDraft, workspace?.scope.periodId ?? null), onClick: () => { void saveEdit(); } },
        ],
        submit: { onSubmit: () => { void saveEdit(); } },
      })],
    });
  }

  function formInput(draft: TaxDraft, allowKindChange: boolean, setDraft: typeof setCreateDraft) {
    return {
      draft,
      workspace,
      allowKindChange,
      onKindChange: (kind: TaxDraft["kind"]) => setDraft(createTaxDraft(kind, scope)),
      onChange: (key: string, value: unknown) => setDraft((current) => current ? { ...current, [key]: String(value ?? "") } as TaxDraft : null),
      onLineChange: (key: string, field: keyof AccrualLineDraft, value: unknown) => setDraft((current) => current?.kind === "workpaper" ? {
        ...current,
        accrualLines: current.accrualLines.map((line) => line.key === key ? { ...line, [field]: String(value ?? "") } : line),
      } : current),
      onAddLine: () => setDraft((current) => current?.kind === "workpaper" ? {
        ...current,
        accrualLines: [...current.accrualLines, createAccrualLineDraft(nextLineNumber(current.accrualLines))],
      } : current),
      onRemoveLine: (key: string) => setDraft((current) => current?.kind === "workpaper" ? {
        ...current,
        accrualLines: current.accrualLines.filter((line) => line.key !== key || line.id),
      } : current),
      onAllocationChange: (key: string, field: keyof AllocationDraft, value: unknown) => setDraft((current) => current?.kind === "payment" ? {
        ...current,
        allocations: current.allocations.map((row) => row.key === key ? { ...row, [field]: String(value ?? "") } : row),
      } : current),
      onAddAllocation: () => setDraft((current) => current?.kind === "payment" ? {
        ...current,
        allocations: [...current.allocations, createAllocationDraft()],
      } : current),
      onRemoveAllocation: (key: string) => setDraft((current) => current?.kind === "payment" ? {
        ...current,
        allocations: current.allocations.filter((row) => row.key !== key),
      } : current),
    };
  }

  async function saveCreate() {
    if (!createDraft || !requestScope) return;
    const mutationScope = requestScope;
    const mutationScopeKey = financeUiRequestScopeKey(mutationScope);
    const ticket = mutationGate.begin(mutationScopeKey);
    setSaving(true);
    try {
      await writeTax("POST", buildTaxWriteInput(createDraft, scope), ticket.signal);
      if (!mutationGate.isCurrent(ticket)) return;
      setCreateDraft(null);
      await load(mutationScope);
      if (!mutationGate.isCurrent(ticket)) return;
      return { outcome: "saved" as const, message: createSuccessMessage(createDraft) };
    } catch (caught) {
      if (!mutationGate.isCurrent(ticket) || isAbortError(caught)) return;
      throw caught;
    } finally {
      if (mutationGate.isCurrent(ticket)) setSaving(false);
    }
  }

  async function saveEdit() {
    if (!editDraft || !requestScope) return;
    const mutationScope = requestScope;
    const mutationScopeKey = financeUiRequestScopeKey(mutationScope);
    const ticket = mutationGate.begin(mutationScopeKey);
    setSaving(true);
    try {
      await writeTax("PUT", buildTaxWriteInput(editDraft, scope), ticket.signal);
      if (!mutationGate.isCurrent(ticket)) return;
      setEditDraft(null);
      await load(mutationScope);
      if (!mutationGate.isCurrent(ticket)) return;
      feedback.success("税务事项已更新");
    } catch (caught) {
      if (!mutationGate.isCurrent(ticket) || isAbortError(caught)) return;
      feedback.error(caught instanceof Error ? caught.message : "税务事项更新失败");
    } finally {
      if (mutationGate.isCurrent(ticket)) setSaving(false);
    }
  }
}

function firstView(tabs: Array<{ key: string }>): TaxView {
  return tabs.find((item) => isTaxView(item.key))?.key as TaxView | undefined ?? "accrual";
}

function isTaxView(key: string): key is TaxView {
  return TAX_VIEW_KEYS.includes(key as TaxView);
}

function defaultCreateKind(view: TaxView, workspace: TaxWorkspace | null): TaxDraft["kind"] {
  if (view === "accrual") return workspace?.registrations.length ? "workpaper" : "registration";
  if (view === "filing-payment") return workspace?.filings.length ? "payment" : "filing";
  return "registration";
}

function nextLineNumber(lines: AccrualLineDraft[]) {
  return Math.max(0, ...lines.map((line) => Number(line.lineNo) || 0)) + 1;
}

function editTitle(draft: TaxDraft) {
  if (draft.kind === "registration") return "编辑纳税登记";
  if (draft.kind === "workpaper") return "编辑计税底稿与明细";
  return "编辑申报";
}

function createSuccessMessage(draft: TaxDraft) {
  if (draft.kind === "registration") return "纳税登记已创建";
  if (draft.kind === "workpaper") return "计税底稿已创建";
  if (draft.kind === "filing") return "申报记录已创建";
  return "缴款记录已追加";
}

async function writeTax(method: "POST" | "PUT", body: unknown, signal: AbortSignal) {
  const response = await fetch(workspacePath("/api/modules/finance/tax"), {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const data = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(errorMessage(data, `税务事项保存失败 (${response.status})`));
  return data;
}

function taxRequestScope(companyCode: string, year: string, month: string): FinanceUiRequestScope | null {
  const numericYear = Number(year);
  const numericMonth = Number(month);
  if (!companyCode.trim() || !Number.isInteger(numericYear) || numericYear < 2000 || numericYear > 2099 || !Number.isInteger(numericMonth) || numericMonth < 1 || numericMonth > 12) return null;
  return { companyCode: companyCode.trim(), year: numericYear, month: numericMonth };
}

function taxScopeFromLocation() {
  const params = new URLSearchParams(window.location.search);
  return taxRequestScope(params.get("companyCode") ?? "", params.get("year") ?? "", params.get("month") ?? "");
}

function isAbortError(value: unknown) {
  return value instanceof DOMException && value.name === "AbortError";
}

function errorMessage(data: unknown, fallback: string) {
  return data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : fallback;
}
