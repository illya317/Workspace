"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import {
  PageSurface,
  createListSection,
  createPageBody,
  createPageTabBar,
  createStatusSection,
  type BodySurfaceProps,
  type BodySurfaceSectionSpec,
  type SurfaceToolbarItems,
} from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import type { TreasuryBlockerDto, TreasuryWorkspaceDto } from "../../types/treasury";
import type { FinanceLedgerDefaultScope } from "../ledger/defaultScope";
import { useFinanceFilterToolbarItems } from "../components/FinanceFilters";
import { getFinanceLifecycleBlocks, getFinancePageViewTabs } from "../components/finance-page-spec";
import { useBankAccountsView } from "./BankAccountsView";
import { useBankReconciliationView } from "./BankReconciliationView";
import { useInterestView } from "./InterestView";
import { useLoansView } from "./LoansView";
import { isTreasuryView, type TreasuryView } from "./treasury-model";
import { createTreasuryRequestGate } from "./treasury-request-scope";
import type { TreasuryMutation } from "./treasury-view-types";

export default function TreasuryClient({
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
    () => getFinancePageViewTabs("treasury", user).filter((item) => isTreasuryView(item.key)),
    [user],
  );
  const [activeView, setActiveView] = useState<TreasuryView>(() => firstView(viewTabs));
  const [companyCode, setCompanyCode] = useState(defaultScope?.companyCode ?? "");
  const [year, setYear] = useState(String(defaultScope?.year ?? ""));
  const [month, setMonth] = useState(String(defaultScope?.month ?? ""));
  const [workspace, setWorkspace] = useState<TreasuryWorkspaceDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetEntityId, setTargetEntityId] = useState<number | null>(null);
  const [locationReady, setLocationReady] = useState(false);
  const loadAbortRef = useRef<AbortController | null>(null);
  const requestGateRef = useRef(createTreasuryRequestGate());
  const selectedScopeRef = useRef({ companyCode, year, month });

  const applyScopeSelection = useCallback((next: { companyCode: string; year: string; month: string }) => {
    const current = selectedScopeRef.current;
    const changed = current.companyCode !== next.companyCode || current.year !== next.year || current.month !== next.month;
    if (changed) {
      selectedScopeRef.current = next;
      requestGateRef.current.invalidate();
      loadAbortRef.current?.abort();
      loadAbortRef.current = null;
      setWorkspace(null);
      setError(null);
      setLoading(false);
    }
    setCompanyCode(next.companyCode);
    setYear(next.year);
    setMonth(next.month);
  }, []);

  useEffect(() => {
    const applyLocation = () => {
      const location = readTreasuryLocation();
      const selected = selectedScopeRef.current;
      applyScopeSelection({
        companyCode: location.companyCode ?? selected.companyCode,
        year: location.year ? String(location.year) : selected.year,
        month: location.month ? String(location.month) : selected.month,
      });
      if (location.view) setActiveView(location.view);
      setTargetEntityId(location.targetEntityId);
      setLocationReady(true);
    };
    applyLocation();
    window.addEventListener("popstate", applyLocation);
    return () => window.removeEventListener("popstate", applyLocation);
  }, [applyScopeSelection]);

  const load = useCallback(async () => {
    loadAbortRef.current?.abort();
    if (!companyCode || !year || !month) {
      setWorkspace(null);
      setError(null);
      setLoading(false);
      return null;
    }
    const requested = { companyCode, year: Number(year), month: Number(month) };
    const controller = new AbortController();
    const ticket = requestGateRef.current.begin(requested);
    loadAbortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ companyCode, year, month });
      const response = await fetch(workspacePath(`/api/modules/finance/treasury?${params.toString()}`), { signal: controller.signal });
      const data = await response.json().catch(() => null) as TreasuryWorkspaceDto | ApiError | null;
      if (!response.ok) throw new Error(apiError(data, `加载失败 (${response.status})`));
      const next = data as TreasuryWorkspaceDto;
      if (controller.signal.aborted || !requestGateRef.current.accepts(ticket, next)) return null;
      setWorkspace(next);
      return next;
    } catch (caught) {
      if (controller.signal.aborted || !requestGateRef.current.isCurrent(ticket)) return null;
      setWorkspace(null);
      setError(caught instanceof Error ? caught.message : "资金管理加载失败");
      return null;
    } finally {
      if (loadAbortRef.current === controller && requestGateRef.current.isCurrent(ticket)) {
        loadAbortRef.current = null;
        setLoading(false);
      }
    }
  }, [companyCode, month, year]);

  useEffect(() => {
    const requestGate = requestGateRef.current;
    void load();
    return () => {
      requestGate.invalidate();
      loadAbortRef.current?.abort();
    };
  }, [load]);

  useEffect(() => {
    if (!locationReady || !companyCode || !year || !month) return;
    writeTreasuryLocation({
      companyCode,
      year: Number(year),
      month: Number(month),
      view: activeView,
      targetEntityId,
    });
  }, [activeView, companyCode, locationReady, month, targetEntityId, year]);

  const mutate: TreasuryMutation = useCallback(async <T,>(method: "POST" | "PUT", payload: object) => {
    const response = await fetch(workspacePath("/api/modules/finance/treasury"), {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => null) as T | ApiError | null;
    if (!response.ok) throw new Error(apiError(data, `保存失败 (${response.status})`));
    await load();
    return data as T;
  }, [load]);

  const extraItems: SurfaceToolbarItems = [
    {
      kind: "action-group",
      key: "treasury-actions",
      actions: [{ key: "refresh", kind: "refresh", label: "刷新", disabled: loading || !companyCode || !year || !month, onClick: () => void load() }],
    },
    ...(workspace ? [{
      kind: "text" as const,
      key: "treasury-period-state",
      content: workspace.scope.isClosed ? "期间已关闭" : "期间开放",
    }] : []),
  ];
  const toolbarItems = useFinanceFilterToolbarItems({
    companyFilter: companyCode,
    yearFilter: year,
    monthFilter: month,
    onCompanyChange: (value) => { applyScopeSelection({ ...selectedScopeRef.current, companyCode: value }); setTargetEntityId(null); },
    onYearChange: (value) => { applyScopeSelection({ ...selectedScopeRef.current, year: value }); setTargetEntityId(null); },
    onMonthChange: (value) => { applyScopeSelection({ ...selectedScopeRef.current, month: value }); setTargetEntityId(null); },
    showSearch: false,
    showPageSize: false,
    extraItems,
  });
  const tabbar = viewTabs.length > 1 ? createPageTabBar({
    items: viewTabs,
    active: activeView,
    onChange: (key) => {
      if (!isTreasuryView(key)) return;
      setActiveView(key);
      setTargetEntityId(null);
    },
  }) : undefined;
  const lifecycleBlocks = getFinanceLifecycleBlocks("treasury");

  const statusSections: BodySurfaceSectionSpec[] = [
    ...lifecycleBlocks,
    ...(loading ? [createStatusSection("treasury-loading", { kind: "loading", content: "正在加载资金管理工作台" })] : []),
    ...(error ? [createStatusSection("treasury-error", { kind: "error", content: error })] : []),
  ];
  if (workspace) {
    return (
      <TreasuryWorkspacePage
        activeView={activeView}
        canCreate={canCreate}
        canUpdate={canUpdate}
        mutate={mutate}
        onActiveViewChange={setActiveView}
        onTargetEntityIdChange={setTargetEntityId}
        statusSections={statusSections}
        tabbar={tabbar}
        targetEntityId={targetEntityId}
        toolbarItems={toolbarItems}
        workspace={workspace}
      />
    );
  }
  return (
    <PageSurface
      kind="standard"
      tabbar={tabbar}
      toolbar={{ items: toolbarItems }}
      body={createPageBody([
        ...statusSections,
        ...(!companyCode || !year || !month
          ? [createStatusSection("treasury-scope-empty", { kind: "empty", content: "请选择公司、年度和月份" })]
          : []),
      ])}
    />
  );
}

function TreasuryWorkspacePage({
  activeView,
  canCreate,
  canUpdate,
  mutate,
  onActiveViewChange,
  onTargetEntityIdChange,
  statusSections,
  tabbar,
  targetEntityId,
  toolbarItems,
  workspace,
}: {
  activeView: TreasuryView;
  canCreate: boolean;
  canUpdate: boolean;
  mutate: TreasuryMutation;
  onActiveViewChange: (view: TreasuryView) => void;
  onTargetEntityIdChange: (id: number | null) => void;
  statusSections: BodySurfaceSectionSpec[];
  tabbar: ReturnType<typeof createPageTabBar> | undefined;
  targetEntityId: number | null;
  toolbarItems: SurfaceToolbarItems;
  workspace: TreasuryWorkspaceDto;
}) {
  const props = { workspace, canCreate, canUpdate, mutate, targetEntityId };
  const bankAccountsBody = useBankAccountsView(props);
  const reconciliationBody = useBankReconciliationView(props);
  const loansBody = useLoansView(props);
  const interestBody = useInterestView(props);
  const bodies: Record<TreasuryView, BodySurfaceProps> = {
    "bank-accounts": bankAccountsBody,
    "bank-reconciliation": reconciliationBody,
    loans: loansBody,
    interest: interestBody,
  };
  const blockerSections = workspace.blockers.length ? [createBlockerSection(workspace.blockers, (blocker) => {
    if (blocker.entityKind === "bank_reconciliation") onActiveViewChange("bank-reconciliation");
    else if (blocker.entityKind === "interest_workpaper") onActiveViewChange("interest");
    onTargetEntityIdChange(blocker.entityId);
  })] : [];
  return (
    <PageSurface
      kind="standard"
      tabbar={tabbar}
      toolbar={{ items: toolbarItems }}
      body={createPageBody([
        ...statusSections,
        ...blockerSections,
        { key: `treasury-${activeView}`, body: bodies[activeView] },
      ])}
    />
  );
}

function createBlockerSection(
  blockers: TreasuryBlockerDto[],
  onOpen: (blocker: TreasuryBlockerDto) => void,
) {
  return createListSection("treasury-blockers", {
    presentation: "list",
    density: "compact",
    items: blockers.map((blocker) => ({
      key: `${blocker.code}-${blocker.entityId ?? "scope"}`,
      title: blocker.message,
      tone: "warning",
      actions: blocker.entityId ? [{ key: "open", label: "打开", icon: "open", onClick: () => onOpen(blocker) }] : undefined,
    })),
  });
}

function firstView(tabs: Array<{ key: string }>): TreasuryView {
  const first = tabs.find((item) => isTreasuryView(item.key));
  return first && isTreasuryView(first.key) ? first.key : "bank-accounts";
}

type ApiError = { error?: string; message?: string; issue?: { message?: string } };

function apiError(value: unknown, fallback: string) {
  if (!value || typeof value !== "object") return fallback;
  const error = value as ApiError;
  return error.issue?.message || error.error || error.message || fallback;
}

function readTreasuryLocation() {
  if (typeof window === "undefined") return { targetEntityId: null };
  const params = new URLSearchParams(window.location.search);
  const viewValue = params.get("view") ?? "";
  const reconciliationId = positiveInteger(params.get("reconciliationId"));
  const workpaperId = positiveInteger(params.get("workpaperId"));
  return {
    companyCode: params.get("companyCode")?.trim() || null,
    year: positiveInteger(params.get("year")),
    month: monthNumber(params.get("month")),
    view: reconciliationId ? "bank-reconciliation" as const : workpaperId ? "interest" as const : isTreasuryView(viewValue) ? viewValue : null,
    targetEntityId: reconciliationId ?? workpaperId,
  };
}

function writeTreasuryLocation(input: {
  companyCode: string;
  year: number;
  month: number;
  view: TreasuryView;
  targetEntityId: number | null;
}) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams({
    companyCode: input.companyCode,
    year: String(input.year),
    month: String(input.month),
    view: input.view,
  });
  if (input.targetEntityId && input.view === "bank-reconciliation") params.set("reconciliationId", String(input.targetEntityId));
  if (input.targetEntityId && input.view === "interest") params.set("workpaperId", String(input.targetEntityId));
  const next = `${window.location.pathname}?${params.toString()}`;
  if (`${window.location.pathname}${window.location.search}` !== next) window.history.replaceState(null, "", next);
}

function positiveInteger(value: string | null) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function monthNumber(value: string | null) {
  const number = positiveInteger(value);
  return number && number <= 12 ? number : null;
}
