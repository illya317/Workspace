"use client";

import { useCallback, useEffect, useState } from "react";
import { DataSurface } from "@workspace/core/ui";
import { listProjectPlanGantt } from "./api";
import ProjectPlanPhasePanel from "./ProjectPlanPhasePanel";
import type { ProjectPlanPhaseItem } from "./plan-gantt-model";

export default function ProjectPlanManagementSection({
  projectId,
  canEdit,
  disabled,
  onToast,
}: {
  projectId: number | null;
  canEdit: boolean;
  disabled: boolean;
  onToast: (toast: { type: "success" | "error"; message: string }) => void;
}) {
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

  if (!projectId) {
    return (
      <DataSurface kind="records" framed title="项目阶段" records={[]} empty="项目保存后可维护项目阶段。" />
    );
  }

  return (
    <ProjectPlanPhasePanel
      projectId={projectId}
      phases={phases}
      canEdit={canEdit}
      disabled={disabled || loading}
      onChanged={loadPlan}
    />
  );
}
