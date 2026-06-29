"use client";

import { useCallback, useEffect, useState } from "react";
import { createPageBody, PageSurface, type BodySurfaceSectionSpec } from "@workspace/core/ui";
import { listProjectPlanGantt } from "./api";
import { useProjectPlanPhaseSection } from "./ProjectPlanPhasePanel";
import type { ProjectPlanPhaseItem } from "./plan-gantt-model";

export function useProjectPlanManagementSection({
  projectId,
  canEdit,
  disabled,
  onToast,
}: {
  projectId: number | null;
  canEdit: boolean;
  disabled: boolean;
  onToast: (toast: { type: "success" | "error"; message: string }) => void;
}): BodySurfaceSectionSpec {
  const [phases, setPhases] = useState<ProjectPlanPhaseItem[]>([]);
  const [loading, setLoading] = useState(false);

  const loadPlan = useCallback(async () => {
    if (!projectId) {
      setPhases([]);
      return;
    }
    setLoading(true);
    try {
      const data = await listProjectPlanGantt(projectId);
      setPhases(data.phases);
    } catch (err) {
      onToast({ type: "error", message: err instanceof Error ? err.message : "加载项目计划失败" });
    } finally {
      setLoading(false);
    }
  }, [onToast, projectId]);

  useEffect(() => { void loadPlan(); }, [loadPlan]);

  return useProjectPlanPhaseSection({
    projectId,
    phases,
    canEdit,
    disabled: disabled || loading,
    onChanged: loadPlan,
  });
}

export default function ProjectPlanManagementSection(props: {
  projectId: number | null;
  canEdit: boolean;
  disabled: boolean;
  onToast: (toast: { type: "success" | "error"; message: string }) => void;
}) {
  const section = useProjectPlanManagementSection(props);
  return <PageSurface kind="standard" embedded body={createPageBody([section])} />;
}
