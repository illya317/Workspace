"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionGlyph,
  CalendarDateInput,
  CommandToolbar,
  CreateStartButton,
  IconActionButton,
  ToolbarOptionGroup,
} from "@workspace/core/ui";
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
import { ReportCollectionTable, ReportDraftTable } from "./WorkReportsTables";

type ReportMode = "fill" | "collection";

export default function WorkReportsPanel({
  target,
  canEdit,
  onToast,
}: {
  target: WorkTarget;
  canEdit: boolean;
  onToast: (toast: { message: string; type: "success" | "error" }) => void;
}) {
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
  }, [onToast, periodStart, target]);

  const loadCollection = useCallback(async () => {
    setLoading(true);
    try {
      setCollection(await listWorkReportCollection(periodStart));
    } catch (err) {
      onToast({ message: err instanceof Error ? err.message : "加载汇报汇总失败", type: "error" });
    } finally {
      setLoading(false);
    }
  }, [onToast, periodStart]);

  useEffect(() => {
    if (mode === "fill") void loadDraft();
    if (mode === "collection") void loadCollection();
  }, [loadCollection, loadDraft, mode]);

  useEffect(() => {
    setMode("fill");
    setDraft(null);
    setDraftSnapshot("");
    setCollection(null);
  }, [target.targetType, target.targetId]);

  async function handleSave() {
    if (!draft || saving || !hasDraftChanges) return;
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
  }

  function updateItem(index: number, patch: Partial<WorkReportItem>) {
    setDraft((current) => current ? {
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    } : current);
  }

  function addAdHocItem() {
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
  }

  function removeItem(index: number) {
    setDraft((current) => current ? {
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    } : current);
  }

  function updatePeriodStart(value: string | null) {
    setDraft(null);
    setDraftSnapshot("");
    setPeriodStart(getWeekStart(value || getCurrentWeekStart()));
  }

  return (
    <div className="space-y-4">
      <CommandToolbar
        filters={(
          <>
            <ToolbarOptionGroup
              ariaLabel="工作汇报视图"
              value={mode}
              options={[
                { value: "fill", label: "填写汇报" },
                { value: "collection", label: "汇总查看" },
              ]}
              onChange={(value) => setMode(value as ReportMode)}
            />
            <div className="h-8 w-px bg-slate-200" />
            <CalendarDateInput value={periodStart} onChange={updatePeriodStart} />
          </>
        )}
        editActions={mode === "fill" && canEdit ? (
          <>
            <CreateStartButton
              label="新增事项"
              active={false}
              disabled={loading || saving}
              onClick={addAdHocItem}
            />
            <IconActionButton
              label={saving ? "保存中..." : "保存汇报"}
              variant="primary"
              onClick={handleSave}
              disabled={loading || saving || !draft || !hasDraftChanges}
              className="!h-9 !w-10 !px-0 !text-[11px] !leading-none"
            >
              <ActionGlyph kind="check" className="h-4 w-4" />
            </IconActionButton>
          </>
        ) : null}
      />

      {mode === "fill" ? (
        <ReportDraftTable
          draft={draft}
          loading={loading}
          canEdit={canEdit && Boolean(draft?.canEdit)}
          onUpdate={updateItem}
          onRemove={removeItem}
        />
      ) : (
        <ReportCollectionTable collection={collection} loading={loading} />
      )}
    </div>
  );
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
