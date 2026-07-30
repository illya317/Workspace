"use client";

import { workspacePath } from "@workspace/core/routing";
import {
  PageSurface,
  createMessageSection,
  createPageBody,
  createPageTabBar,
  createStatusSection,
  type BodySurfaceSectionSpec,
  type SurfaceToolbarItems,
} from "@workspace/core/ui";
import type { ManagementAnalysis } from "@workspace/finance/types";
import { useCompanyOptions } from "@workspace/platform/hooks";
import type { SessionUser } from "@workspace/platform/types";
import { useTenantConfig } from "@workspace/platform/ui/tenant-config";
import { useEffect, useMemo, useState } from "react";
import { getFinanceLifecycleBlocks } from "../components/finance-page-spec";
import { buildFundFlowSections } from "./FundFlowSections";
import {
  buildBudgetForecastSections,
  buildInvestmentSections,
  buildManagementOverviewSections,
  buildPerformanceRiskSections,
  buildProfitabilityCostSections,
  buildWorkingCapitalSections,
  managementAccountingTabs,
  type ManagementAccountingView,
} from "./ManagementAccountingSections";

function useManagementData(scope: string, year: number) {
  const [data, setData] = useState<ManagementAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ companyCodes: scope, year: String(year) });
    fetch(workspacePath(`/api/modules/finance/analysis/management?${params}`), { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "管理会计分析加载失败");
        return payload as ManagementAnalysis;
      })
      .then(setData)
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "管理会计分析加载失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [scope, year]);

  return { data, error, loading };
}

function viewSections(view: ManagementAccountingView, data: ManagementAnalysis) {
  if (view === "cash") return [...buildWorkingCapitalSections(data), ...buildFundFlowSections(data.fundFlow)];
  if (view === "budget") return buildBudgetForecastSections(data);
  if (view === "profitability") return buildProfitabilityCostSections(data);
  if (view === "investment") return buildInvestmentSections(data.fundFlow, data);
  if (view === "performance") return buildPerformanceRiskSections(data);
  return buildManagementOverviewSections(data);
}

export default function FinanceAnalysisClient({ user: _user }: { user: SessionUser }) {
  const tenant = useTenantConfig();
  const defaultGroupCodes = tenant.finance.consolidationCompanyCodes;
  const defaultScope = defaultGroupCodes.join(",");
  const companyOptions = useCompanyOptions();
  const [scope, setScope] = useState(defaultScope);
  const [year, setYear] = useState(tenant.finance.defaultAnalysisYear);
  const [view, setView] = useState<ManagementAccountingView>("overview");
  const { data, error, loading } = useManagementData(scope, year);
  const navigation = useMemo(() => createPageTabBar({
    items: managementAccountingTabs,
    active: view,
    onChange: (key) => setView(key as ManagementAccountingView),
  }), [view]);
  const selectedCompanyOptions = defaultGroupCodes.map((code) => companyOptions.find((option) => option.value === code)).filter((option): option is NonNullable<typeof option> => Boolean(option));
  const scopeOptions = [
    { value: defaultScope, label: "合并口径" },
    ...selectedCompanyOptions,
  ];
  const availableYears = data?.fundFlow.scope.availableYears.length ? data.fundFlow.scope.availableYears : [year];
  const yearOptions = availableYears.map((value) => ({ value: String(value), label: String(value) }));
  const toolbarItems: SurfaceToolbarItems = [
    { kind: "select", key: "scope", label: "分析范围", options: scopeOptions, value: scope, onChange: setScope },
    { kind: "select", key: "year", label: "年度", options: yearOptions, value: String(year), onChange: (value) => setYear(Number(value)) },
    { kind: "text", key: "period", content: data?.scope.periodLabel ?? `${year}年` },
    ...(loading ? [{ kind: "text" as const, key: "loading", content: "正在核对三表、流水、预算与成本数据…" }] : []),
  ];
  const lifecycleBlocks = getFinanceLifecycleBlocks("analysis");
  let sections: BodySurfaceSectionSpec[];
  if (!data && loading) {
    sections = [...lifecycleBlocks, createStatusSection("management-loading", { kind: "loading", content: "正在生成管理会计分析" })];
  } else if (!data) {
    sections = [...lifecycleBlocks, createStatusSection("management-error", { kind: "error", content: error || "管理会计分析加载失败" })];
  } else {
    sections = [
      ...lifecycleBlocks,
      ...(error ? [createMessageSection("management-refresh-error", { tone: "danger", content: error })] : []),
      ...viewSections(view, data),
    ];
  }

  return (
    <PageSurface
      kind="standard"
      tabbar={navigation}
      toolbar={{ items: toolbarItems }}
      body={createPageBody(sections)}
    />
  );
}
