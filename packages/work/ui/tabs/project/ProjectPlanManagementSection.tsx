"use client";

import { useCallback, useEffect, useState } from "react";
import { ActionButton, EmptyStateCard, SectionCard } from "@workspace/core/ui";
import { createProjectPlanBaseline, listProjectPlanGantt } from "./api";
import ProjectPlanPhasePanel from "./ProjectPlanPhasePanel";
import type { ProjectPlanBaseline, ProjectPlanPhaseItem } from "./plan-gantt-model";

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
  const [activeBaseline, setActiveBaseline] = useState<ProjectPlanBaseline | null>(null);
  const [loading, setLoading] = useState(false);

  const loadPlan = useCallback(async () => {
    if (!projectId) {
      setPhases([]);
      setActiveBaseline(null);
      return;
    }
    setLoading(true);
    try {
      const data = await listProjectPlanGantt(projectId);
      setPhases(data.phases);
      setActiveBaseline(data.activeBaseline);
    } catch (err) {
      onToast({ type: "error", message: err instanceof Error ? err.message : "加载项目计划失败" });
    } finally {
      setLoading(false);
    }
  }, [onToast, projectId]);

  useEffect(() => { void loadPlan(); }, [loadPlan]);

  async function handleCreateBaseline() {
    if (!projectId || loading) return;
    setLoading(true);
    try {
      await createProjectPlanBaseline(projectId);
      await loadPlan();
      onToast({ type: "success", message: "项目基线已保存" });
    } catch (err) {
      onToast({ type: "error", message: err instanceof Error ? err.message : "保存项目基线失败" });
    } finally {
      setLoading(false);
    }
  }

  if (!projectId) {
    return (
      <SectionCard title="计划阶段">
        <EmptyStateCard compact>项目保存后可维护计划阶段。</EmptyStateCard>
      </SectionCard>
    );
  }

  return (
    <>
      <SectionCard
        title="项目基线"
        actions={canEdit ? (
          <ActionButton variant="primary" disabled={disabled || loading} onClick={() => void handleCreateBaseline()}>
            保存当前基线
          </ActionButton>
        ) : null}
      >
        <div className="text-sm font-medium text-slate-600">
          {activeBaseline ? `当前基线：${activeBaseline.name}` : "未设置基线"}
        </div>
      </SectionCard>

      <ProjectPlanPhasePanel
        projectId={projectId}
        phases={phases}
        canEdit={canEdit}
        disabled={disabled || loading}
        onChanged={loadPlan}
      />
    </>
  );
}
