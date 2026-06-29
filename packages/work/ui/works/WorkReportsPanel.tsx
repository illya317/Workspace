"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { BodySurfaceSectionSpec, SurfaceToolbarItems } from "@workspace/core/ui";
import {
  getWorkReportDraft,
  listWorkReportCollection,
  saveWorkReport,
} from "./api";
import type {
  WorkReportCollectionResponse,
  WorkReportDraftResponse,
  WorkReportItem,
  WorkTarget,
} from "./types";
import {
  createReportCollectionTableSection,
  createReportDraftTableSection,
  ReportCollectionTable,
  ReportDraftTable,
} from "./WorkReportsTables";

type ReportMode = "fill" | "collection";

export interface WorkReportsController {
  toolbarItems: SurfaceToolbarItems;
  mode: ReportMode;
  draft: WorkReportDraftResponse | null;
  collection: WorkReportCollectionResponse | null;
  loading: boolean;
  canEditDraft: boolean;
  updateItem: (index: number, patch: Partial<WorkReportItem>) => void;
  removeItem: (index: number) => void;
}

export function useWorkReportsController({
  target,
  canEdit,
  onToast,
  enabled,
}: {
  target: WorkTarget | null;
  canEdit: boolean;
  onToast: (toast: { message: string; type: "success" | "error" }) => void;
  enabled: boolean;
}): WorkReportsController {
  const [mode, setMode] = useState<ReportMode>("fill");
  const [periodStart, setPeriodStart] = useState(() => getCurrentWeekStart());
  const [draft, setDraft] = useState<WorkReportDraftResponse | null>(null);
  const [draftSnapshot, setDraftSnapshot] = useState("");
  const [collection, setCollection] = useState<WorkReportCollectionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const draftChangeKey = useMemo(() => draft ? serializeReportItems(draft.items) : "", [draft]);
  const hasDraftChanges = Boolean(draft) && draftChangeKey !== draftSnapshot;

  const loadDraft = useCallback(async () => {
    if (!target || !enabled) return;
    setLoading(true);
    try {
      const data = await getWorkReportDraft(target, periodStart);
      setDraft(data);
      setDraftSnapshot(serializeReportItems(data.items));
    } catch (err) {
      onToast({ message: err instanceof Error ? err.message : "加载工作汇报失败", type: "error" });
    } finally {
      setLoading(false);
    }
  }, [enabled, onToast, periodStart, target]);

  const loadCollection = useCallback(async () => {
    if (!target || !enabled) return;
    setLoading(true);
    try {
      setCollection(await listWorkReportCollection(periodStart));
    } catch (err) {
      onToast({ message: err instanceof Error ? err.message : "加载汇报汇总失败", type: "error" });
    } finally {
      setLoading(false);
    }
  }, [enabled, onToast, periodStart, target]);

  useEffect(() => {
    if (!target || !enabled) return;
    if (mode === "fill") void loadDraft();
    if (mode === "collection") void loadCollection();
  }, [enabled, loadCollection, loadDraft, mode, target]);

  useEffect(() => {
    setMode("fill");
    setDraft(null);
    setDraftSnapshot("");
    setCollection(null);
  }, [target?.targetType, target?.targetId]);

  const handleSave = useCallback(async () => {
    if (!target || !draft || saving || !hasDraftChanges) return;
    setSaving(true);
    try {
      const data = await saveWorkReport(target, periodStart, draft.items);
      setDraft(data);
      setDraftSnapshot(serializeReportItems(data.items));
      onToast({ message: "工作汇报已保存", type: "success" });
    } catch (err) {
      onToast({ message: err instanceof Error ? err.message : "保存工作汇报失败", type: "error" });
    } finally {
      setSaving(false);
    }
  }, [draft, hasDraftChanges, onToast, periodStart, saving, target]);

  const updateItem = useCallback((index: number, patch: Partial<WorkReportItem>) => {
    setDraft((current) => current ? {
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    } : current);
  }, []);

  const addAdHocItem = useCallback(() => {
    setDraft((current) => current ? {
      ...current,
      items: [
        ...current.items,
        {
          id: null,
          workItemId: null,
          title: "",
          previousPlanSnapshot: "",
          doneThisWeek: "",
          planNextWeek: "",
          sortOrder: nextSortOrder(current.items),
          source: "adHoc",
        },
      ],
    } : current);
  }, []);

  const removeItem = useCallback((index: number) => {
    setDraft((current) => current ? {
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    } : current);
  }, []);

  const updatePeriodStart = useCallback((value: string | null) => {
    setDraft(null);
    setDraftSnapshot("");
    setPeriodStart(getWeekStart(value || getCurrentWeekStart()));
  }, []);

  const toolbarItems = useMemo(() => [
    {
      kind: "option-group",
      key: "report-mode",
      section: "filter",
      value: mode,
      options: [
        { value: "fill", label: "填写汇报" },
        { value: "collection", label: "汇总查看" },
      ],
      onChange: (value) => setMode(value as ReportMode),
      ariaLabel: "工作汇报视图",
    },
    {
      kind: "period",
      key: "report-period",
      mode: "date",
      value: periodStart,
      onChange: updatePeriodStart,
    },
    ...(mode === "fill" && canEdit
      ? [
          {
            kind: "create" as const,
            key: "report-create",
            label: "新增事项",
            disabled: loading || saving,
            onClick: addAdHocItem,
          },
          {
            kind: "action-group" as const,
            key: "report-save",
            section: "edit" as const,
            actions: [
              {
                key: "save",
                kind: "check" as const,
                label: saving ? "保存中..." : "保存汇报",
                variant: "primary" as const,
                onClick: handleSave,
                disabled: loading || saving || !draft || !hasDraftChanges,
              },
            ],
          },
        ]
      : []),
  ] satisfies SurfaceToolbarItems, [addAdHocItem, canEdit, draft, handleSave, hasDraftChanges, loading, mode, periodStart, saving, updatePeriodStart]);

  return {
    toolbarItems,
    mode,
    draft,
    collection,
    loading,
    canEditDraft: canEdit && Boolean(draft?.canEdit),
    updateItem,
    removeItem,
  };
}

export default function WorkReportsPanel({ controller }: { controller: WorkReportsController }) {
  return (
    <div className="space-y-4">
      {controller.mode === "fill" ? (
        <ReportDraftTable
          draft={controller.draft}
          loading={controller.loading}
          canEdit={controller.canEditDraft}
          onUpdate={controller.updateItem}
          onRemove={controller.removeItem}
        />
      ) : (
        <ReportCollectionTable collection={controller.collection} loading={controller.loading} />
      )}
    </div>
  );
}

export function createWorkReportsPanelSections(controller: WorkReportsController): BodySurfaceSectionSpec[] {
  return [
    controller.mode === "fill"
      ? createReportDraftTableSection({
          draft: controller.draft,
          loading: controller.loading,
          canEdit: controller.canEditDraft,
          onUpdate: controller.updateItem,
          onRemove: controller.removeItem,
        })
      : createReportCollectionTableSection({
          collection: controller.collection,
          loading: controller.loading,
        }),
  ];
}

function nextSortOrder(items: WorkReportItem[]) {
  if (items.length === 0) return 10;
  return Math.max(...items.map((item) => item.sortOrder || 0)) + 10;
}

function serializeReportItems(items: WorkReportItem[]) {
  return JSON.stringify(items.map((item) => ({
    id: item.id,
    workItemId: item.workItemId,
    title: item.title,
    doneThisWeek: item.doneThisWeek,
    planNextWeek: item.planNextWeek,
    source: item.source,
    sortOrder: item.sortOrder,
  })));
}

function getCurrentWeekStart() {
  const now = new Date();
  return getWeekStart(`${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`);
}

function getWeekStart(value: string) {
  const date = parseDate(value);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 1 - day);
  return formatDate(date);
}

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}
