"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type BodySurfaceSelectorProps,
  type FormSurfaceActionSpec,
  type SurfaceToolbarItems,
} from "@workspace/core/ui";
import { actionRuntimeCommands, workflowActionSurfaceActions } from "@workspace/platform/ui";
import { getWorkOkrControlResponse, getWorkReportDraft, saveWorkReport } from "./api";
import type { WorkReportDraftResponse, WorkReportItem, WorkOkrControlCycleOption, WorkTarget } from "./types";
import {
  createReportPeriodRecords,
  findCycleForDate,
  getCurrentWeekStart,
  normalizeReportPeriodType,
  periodStartForSelection,
  REPORT_PERIOD_TYPE_OPTIONS,
  reportPeriodRecordKey,
  type ReportPeriodType,
  type WorkReportPeriodRecord,
} from "./WorkReportPeriods";

export interface WorkReportsController {
  toolbarItems: SurfaceToolbarItems;
  formActions: FormSurfaceActionSpec[];
  draft: WorkReportDraftResponse | null;
  loading: boolean;
  canEditDraft: boolean;
  periodType: ReportPeriodType;
  periodStart: string;
  selectedCycle: WorkOkrControlCycleOption | null;
  cycleOptions: WorkOkrControlCycleOption[];
  periodRecords: WorkReportPeriodRecord[];
  updatePeriodType: (value: unknown) => void;
  selectPeriodRecord: (record: WorkReportPeriodRecord) => void;
  updateItem: (index: number, patch: Partial<WorkReportItem>) => void;
}

export function useWorkReportsController({ target, canEdit, onToast, enabled }: {
  target: WorkTarget | null;
  canEdit: boolean;
  onToast: (toast: { message: string; type: "success" | "error" }) => void;
  enabled: boolean;
}): WorkReportsController {
  const [periodType, setPeriodType] = useState<ReportPeriodType>("weekly");
  const [periodStart, setPeriodStart] = useState(() => getCurrentWeekStart());
  const [cycleOptions, setCycleOptions] = useState<WorkOkrControlCycleOption[]>([]);
  const [draft, setDraft] = useState<WorkReportDraftResponse | null>(null);
  const [draftSnapshot, setDraftSnapshot] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const wasEnabled = useRef(false);
  const draftChangeKey = useMemo(() => draft ? serializeReportItems(draft.items) : "", [draft]);
  const hasDraftChanges = Boolean(draft) && draftChangeKey !== draftSnapshot;
  const selectedCycle = useMemo(
    () => findCycleForDate(cycleOptions, periodType, periodStart),
    [cycleOptions, periodStart, periodType],
  );
  const periodRecords = useMemo(
    () => createReportPeriodRecords(cycleOptions, periodType, periodStart, { policies: [], settings: null, target }),
    [cycleOptions, periodStart, periodType, target],
  );

  useEffect(() => {
    let ignore = false;
    if (!enabled) return;
    getWorkOkrControlResponse()
      .then((data) => { if (!ignore) setCycleOptions(data.cycles || []); })
      .catch(() => { if (!ignore) setCycleOptions([]); });
    return () => { ignore = true; };
  }, [enabled]);

  useEffect(() => {
    const enteringReporting = enabled && !wasEnabled.current;
    wasEnabled.current = enabled;
    if (enteringReporting) setPeriodStart(getCurrentWeekStart());
  }, [enabled]);

  const loadDraft = useCallback(async (options?: { isCancelled?: () => boolean }) => {
    if (!target || !enabled) return;
    setLoading(true);
    try {
      const data = await getWorkReportDraft(target, periodType, periodStart, "final");
      if (options?.isCancelled?.()) return;
      setDraft(data);
      setDraftSnapshot(serializeReportItems(data.items));
    } catch (error) {
      if (!options?.isCancelled?.()) {
        onToast({ message: error instanceof Error ? error.message : "加载工作汇报失败", type: "error" });
      }
    } finally {
      if (!options?.isCancelled?.()) setLoading(false);
    }
  }, [enabled, onToast, periodStart, periodType, target]);

  useEffect(() => {
    let cancelled = false;
    if (target && enabled) void loadDraft({ isCancelled: () => cancelled });
    return () => { cancelled = true; };
  }, [enabled, loadDraft, target]);

  useEffect(() => {
    setDraft(null);
    setDraftSnapshot("");
  }, [target?.targetType, target?.targetId]);

  const saveReportRecord = useCallback(async () => {
    if (!target || !draft || saving || !canEdit) return;
    setSaving(true);
    try {
      const outcome = await saveWorkReport(target, periodType, periodStart, "final", draft.items);
      if (outcome.executionMode === "workflow") {
        setDraftSnapshot(serializeReportItems(draft.items));
        onToast({ message: "工作汇报已提交审核", type: "success" });
        return;
      }
      const data = outcome.report;
      setDraft(data);
      setDraftSnapshot(serializeReportItems(data.items));
      onToast({ message: "工作汇报快照已保存", type: "success" });
    } catch (error) {
      onToast({ message: error instanceof Error ? error.message : "保存工作汇报失败", type: "error" });
    } finally {
      setSaving(false);
    }
  }, [canEdit, draft, onToast, periodStart, periodType, saving, target]);

  const updateItem = useCallback((index: number, patch: Partial<WorkReportItem>) => {
    setDraft((current) => current ? {
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    } : current);
  }, []);

  const updatePeriodType = useCallback((value: unknown) => {
    const nextType = normalizeReportPeriodType(value);
    setDraft(null);
    setDraftSnapshot("");
    setPeriodType(nextType);
    setPeriodStart(periodStartForSelection(nextType, getCurrentWeekStart(), cycleOptions));
  }, [cycleOptions]);

  const selectPeriodRecord = useCallback((record: WorkReportPeriodRecord) => {
    setDraft(null);
    setDraftSnapshot("");
    setPeriodStart(record.periodStart);
  }, []);

  const toolbarItems = useMemo(() => [{
    kind: "option-group",
    key: "report-period-type",
    value: periodType,
    options: REPORT_PERIOD_TYPE_OPTIONS,
    onChange: updatePeriodType,
    ariaLabel: "汇报周期",
    presentation: "segmented" as const,
  }] satisfies SurfaceToolbarItems, [periodType, updatePeriodType]);

  const actionDisabled = loading || saving || !draft || !hasDraftChanges;
  const formActions = workflowActionSurfaceActions(actionRuntimeCommands(draft?.actionRuntime, {
    "record.save": { label: "保存快照", disabled: actionDisabled, onClick: () => void saveReportRecord() },
    "workflow.request.submit": { disabled: actionDisabled, onClick: () => void saveReportRecord() },
    "form.cancel": { label: "取消修改", disabled: loading || saving || !hasDraftChanges, onClick: () => void loadDraft() },
  }));

  return {
    toolbarItems,
    formActions,
    draft,
    loading,
    canEditDraft: canEdit && draft?.canEdit === true && draft.actionRuntime.editability === "editable",
    periodType,
    periodStart,
    selectedCycle,
    cycleOptions,
    periodRecords,
    updatePeriodType,
    selectPeriodRecord,
    updateItem,
  };
}

export function createWorkReportPeriodNavigationBody(controller: WorkReportsController): BodySurfaceSelectorProps {
  return {
    kind: "selector",
    selector: {
      kind: "list",
      title: "汇报周期",
      loading: controller.loading && controller.periodRecords.length === 0,
      loadingText: "加载周期中...",
      emptyText: "暂无可选择汇报周期",
      items: controller.periodRecords.map((record) => ({
        key: record.key,
        value: record,
        group: record.group,
        card: {
          title: record.title,
          subtitle: record.subtitle,
          code: record.current ? "当前" : undefined,
          codeTone: "success",
          active: record.active,
          size: "sm",
        },
      })),
      selectedId: reportPeriodRecordKey(controller.periodType, controller.periodStart),
      onSelect: controller.selectPeriodRecord,
    },
  };
}

function serializeReportItems(items: WorkReportItem[]) {
  return JSON.stringify(items.map((item) => ({
    id: item.id,
    workItemId: item.workItemId,
    title: item.title,
    workPlanId: item.workPlanId,
    workPlanTitle: item.workPlanTitle,
    workPlanKind: item.workPlanKind,
    workItemType: item.workItemType,
    parentWorkItemId: item.parentWorkItemId,
    parentTitle: item.parentTitle,
    currentKeyResult: item.currentKeyResult,
    nextObjective: item.nextObjective,
    note: item.note,
    selfScore: item.selfScore,
    performanceScore: item.performanceScore,
    source: item.source,
    sortOrder: item.sortOrder,
  })));
}
