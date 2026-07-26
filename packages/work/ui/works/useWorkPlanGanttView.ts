"use client";

import { useCallback, useEffect, useState } from "react";
import type { BodySurfaceSectionSpec, SurfaceToolbarItems } from "@workspace/core/ui";
import { listWorkItems } from "./api";
import { WORK_GANTT_ZOOM_OPTIONS, periodLabel, periodValue, useWorkGanttViewport, type WorkGanttZoom } from "../gantt";
import { createWorkPlanGanttSection } from "./WorkPlanGanttSection";
import type { WorkItem, WorkPlan, WorkTaskSpace } from "./types";

export function useWorkPlanGanttView({
  active,
  currentSpace,
  plans,
  plansLoading,
  onToast,
}: {
  active: boolean;
  currentSpace: WorkTaskSpace | null;
  plans: WorkPlan[];
  plansLoading: boolean;
  onToast: (message: string, type: "success" | "error") => void;
}): { section: BodySurfaceSectionSpec; toolbarItems: SurfaceToolbarItems } {
  const [works, setWorks] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const viewport = useWorkGanttViewport();
  const loadWorks = useCallback(async (options?: { isCancelled?: () => boolean }) => {
    if (!currentSpace || !active) {
      if (options?.isCancelled?.()) return;
      setWorks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const nextWorks = await listWorkItems(currentSpace, null);
      if (!options?.isCancelled?.()) setWorks(nextWorks);
    } catch (err) {
      if (!options?.isCancelled?.()) onToast(err instanceof Error ? err.message : "加载甘特节点失败", "error");
    } finally {
      if (!options?.isCancelled?.()) setLoading(false);
    }
  }, [active, currentSpace, onToast]);

  useEffect(() => {
    let cancelled = false;
    void loadWorks({ isCancelled: () => cancelled });
    return () => { cancelled = true; };
  }, [loadWorks]);

  useEffect(() => {
    setExpandedKeys(new Set());
  }, [currentSpace?.targetType, currentSpace?.targetId, viewport.zoom, viewport.periodStart]);

  const toggleRow = useCallback((key: string) => {
    setExpandedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  return {
    section: createWorkPlanGanttSection({
      plans,
      works,
      loading: plansLoading || loading,
      periodStart: viewport.periodStart,
      zoom: viewport.zoom,
      expandedKeys,
      onToggleRow: toggleRow,
    }),
    toolbarItems: createGanttToolbarItems(viewport),
  };
}

function createGanttToolbarItems(viewport: ReturnType<typeof useWorkGanttViewport>): SurfaceToolbarItems {
  return [
    {
      kind: "option-group",
      key: "gantt-zoom",
      value: viewport.zoom,
      options: WORK_GANTT_ZOOM_OPTIONS,
      onChange: (value) => viewport.changeZoom(value as WorkGanttZoom),
      ariaLabel: "甘特时间缩放",
    },
    {
      kind: "period",
      key: "gantt-period",
      mode: "nav",
      label: periodLabel(viewport.periodStart, viewport.zoom),
      onPrevious: viewport.previousPeriod,
      onNext: viewport.nextPeriod,
      picker: {
        precision: viewport.zoom,
        value: periodValue(viewport.periodStart, viewport.zoom),
        onChange: viewport.changePeriod,
        ariaLabel: "选择甘特期间",
      },
    },
  ];
}
