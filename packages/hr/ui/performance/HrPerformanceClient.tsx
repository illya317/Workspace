"use client";

import { useCallback, useEffect, useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import { createPageTabBar, useFeedback, type SurfaceToolbarItems } from "@workspace/core/ui";
import type { PeriodDossierModel } from "@workspace/platform/period-dossier";
import type { SessionUser } from "@workspace/platform/types";
import { PeriodDossierPage } from "@workspace/platform/ui";
import { getPageViewTabs } from "@workspace/platform/view-registry";
import {
  HrPerformanceView,
} from "./HrPerformanceView";
import type {
  DashboardData,
  PerfTab,
  PerformanceAudience,
  PerformancePeriodType,
} from "./performance-types";
import { usePerformanceReviewEditor } from "./use-performance-review-editor";

const tabs = getPageViewTabs("/hr/performance") as Array<{
  key: PerfTab;
  label: string;
  children?: Array<{ key: PerformanceAudience; label: string }>;
}>;

const PERIOD_TYPE_OPTIONS: Array<{ value: PerformancePeriodType; label: string }> = [
  { value: "yearly", label: "年" },
  { value: "half_year", label: "半年" },
  { value: "quarterly", label: "季度" },
  { value: "monthly", label: "月" },
  { value: "weekly", label: "周" },
];

const AUDIENCE_SEARCH_LABEL: Record<PerformanceAudience, string> = {
  personal: "人员",
  department: "部门",
  project: "项目",
};

type DashboardFilters = {
  cycleId: string;
  periodType: PerformancePeriodType;
  audience: PerformanceAudience;
  audienceId: string;
};

type ContributionSelection = { type: PerformanceAudience; id: number };

export default function HrPerformanceClient({ user: _user }: { user: SessionUser; hideShell?: boolean }) {
  const [activeTab, setActiveTab] = useState<PerfTab>("attendance");
  const [data, setData] = useState<DashboardData | null>(null);
  const [cycleId, setCycleId] = useState("");
  const [periodType, setPeriodType] = useState<PerformancePeriodType>("monthly");
  const [audience, setAudience] = useState<PerformanceAudience>("personal");
  const [audienceId, setAudienceId] = useState("");
  const [contributionSelection, setContributionSelection] = useState<ContributionSelection | null>(null);
  const [dossier, setDossier] = useState<PeriodDossierModel | null>(null);
  const [dossierLoading, setDossierLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const { error: showError } = useFeedback();

  const loadData = useCallback(async (filters: DashboardFilters) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.cycleId) params.set("cycleId", filters.cycleId);
    params.set("periodType", filters.periodType);
    params.set("audienceType", filters.audience);
    if (filters.audienceId) params.set("audienceId", filters.audienceId);
    const response = await fetch(workspacePath(`/api/modules/hr/performance?${params.toString()}`));
    if (!response.ok) {
      setData(null);
      showError(await readError(response) || "绩效工作台加载失败");
      setLoading(false);
      return;
    }
    const nextData = await response.json() as DashboardData;
    setData(nextData);
    const nextCycleId = nextData.activeCycleId ? String(nextData.activeCycleId) : "";
    if (nextCycleId !== filters.cycleId) setCycleId(nextCycleId);
    setLoading(false);
  }, [showError]);

  useEffect(() => {
    void loadData({ cycleId, periodType, audience, audienceId });
  }, [audience, audienceId, cycleId, loadData, periodType]);

  useEffect(() => {
    let cancelled = false;
    if (activeTab !== "works" || !contributionSelection || !cycleId) {
      setDossier(null);
      setDossierLoading(false);
      return;
    }
    setDossierLoading(true);
    fetch(workspacePath(`/api/modules/hr/performance/contributions/${contributionSelection.type}/${contributionSelection.id}?cycleId=${cycleId}`))
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return response.json() as Promise<{ dossier: PeriodDossierModel }>;
      })
      .then((result) => { if (!cancelled) setDossier(result.dossier); })
      .catch((error) => {
        if (cancelled) return;
        setDossier(null);
        showError(error instanceof Error ? error.message : "贡献材料加载失败");
      })
      .finally(() => { if (!cancelled) setDossierLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, contributionSelection, cycleId, showError]);

  const selectedCycleId = Number(cycleId || data?.activeCycleId || 0);
  const reloadPerformance = useCallback(
    () => loadData({ cycleId, periodType, audience, audienceId }),
    [audience, audienceId, cycleId, loadData, periodType],
  );
  const editor = usePerformanceReviewEditor({ data, selectedCycleId, reload: reloadPerformance });

  const cycleOptions = (data?.cycleOptions ?? []).filter((cycle) => cycle.periodType === periodType);
  const periodTypeOptions = PERIOD_TYPE_OPTIONS.filter((option) => (
    (data?.cycleOptions ?? []).some((cycle) => cycle.periodType === option.value)
  ));
  const audienceOptions = (data?.audienceOptions?.[audience] ?? []).map((option) => ({
    value: String(option.id),
    name: option.name,
    details: option.details,
    searchText: [option.name, option.details].filter(Boolean).join(" "),
  }));

  function changePeriodType(next: string) {
    const normalized = PERIOD_TYPE_OPTIONS.some((option) => option.value === next)
      ? next as PerformancePeriodType
      : "monthly";
    const today = new Date().toISOString().slice(0, 10);
    const candidates = (data?.cycleOptions ?? []).filter((cycle) => cycle.periodType === normalized);
    const preferred = candidates.find((cycle) => cycle.startDate <= today && cycle.endDate >= today)
      ?? candidates[0]
      ?? null;
    setPeriodType(normalized);
    setCycleId(preferred ? String(preferred.id) : "");
    setContributionSelection(null);
  }

  function changeAudience(next: PerformanceAudience) {
    setAudience(next);
    setAudienceId("");
    setContributionSelection(null);
  }

  function changeAudienceId(next: string) {
    setAudienceId(next);
    setContributionSelection(null);
  }

  function changeActiveTab(next: PerfTab) {
    setActiveTab(next);
    setContributionSelection(null);
    if (next === "attendance" && audience !== "personal") changeAudience("personal");
  }

  function changeCycle(next: string) {
    setCycleId(next);
    setContributionSelection(null);
  }

  const toolbarItems: SurfaceToolbarItems = [
    {
      kind: "autocomplete",
      key: `audience-search-${audience}`,
      value: audienceId,
      options: audienceOptions,
      onChange: changeAudienceId,
      placeholder: `搜索${AUDIENCE_SEARCH_LABEL[audience]}`,
      ariaLabel: `搜索${AUDIENCE_SEARCH_LABEL[audience]}`,
      visibleCount: 8,
    },
    {
      kind: "select",
      key: "period-type",
      label: "周期类型",
      value: periodType,
      options: periodTypeOptions,
      onChange: changePeriodType,
      placeholder: "周期类型",
      visibleCount: 5,
    },
    {
      kind: "select",
      key: "cycle",
      label: "周期",
      value: cycleId,
      options: cycleOptions.map((cycle) => ({ value: String(cycle.id), label: cycle.label || cycle.code })),
      onChange: changeCycle,
      placeholder: "选择周期",
      visibleCount: 8,
    },
    {
      kind: "icon-button",
      key: "refresh",
      icon: "refresh",
      label: "刷新",
      variant: "primary",
      disabled: loading,
      onClick: () => void loadData({ cycleId, periodType, audience, audienceId }),
    },
  ];

  const navigation = createPageTabBar({
    items: tabs,
    active: activeTab,
    activeChild: audience,
    onChange: (key: string) => changeActiveTab(key as PerfTab),
    onChildChange: (key: string) => changeAudience(key as PerformanceAudience),
    variant: "large",
    ariaLabel: "绩效视图",
  });
  const toolbar = { items: toolbarItems, onSubmit: () => void loadData({ cycleId, periodType, audience, audienceId }) };

  if (activeTab === "works" && contributionSelection) {
    return (
      <PeriodDossierPage
        model={dossier}
        loading={dossierLoading}
        navigation={navigation}
        toolbar={toolbar}
        onBack={() => setContributionSelection(null)}
      />
    );
  }

  return (
    <HrPerformanceView
      navigation={navigation}
      activeTab={activeTab}
      audience={audience}
      toolbarItems={toolbarItems}
      data={data}
      loading={loading}
      saving={editor.saving}
      canCreateSelfReview={editor.canCreateSelfReview}
      showCreateSelfReview={editor.showCreateSelfReview}
      editorActions={editor.editorActions}
      editorFieldsDisabled={editor.editorFieldsDisabled}
      editorOpen={editor.editorOpen}
      editorStage={editor.editorStage}
      selectedSubmissionId={editor.selectedSubmissionId}
      draft={editor.draft}
      onDraftChange={editor.setDraft}
      onCreateReview={editor.beginCreate}
      onSelectSubmission={editor.beginEdit}
      onOpenContribution={(type, id) => setContributionSelection({ type, id })}
      onSubmissionAction={editor.runRowAction}
      onToolbarSubmit={() => void loadData({ cycleId, periodType, audience, audienceId })}
    />
  );
}

async function readError(response: Response) {
  const fallback = `请求失败 (${response.status})`;
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    try {
      const text = await response.text();
      const compact = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      return compact ? `${compact.slice(0, 120)} (${response.status})` : fallback;
    } catch {
      return fallback;
    }
  }
  try {
    const json = await response.json();
    return String(json.error || json.message || fallback);
  } catch {
    return fallback;
  }
}
