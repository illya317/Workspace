import { workspacePath } from "@workspace/core/routing";
import type {
  WorkItem,
  WorkItemDraft,
  WorkReportCollectionResponse,
  WorkReportDraftResponse,
  WorkReportItem,
  WorkSpacePermissionRow,
  WorkTaskSpace,
  WorkTarget,
} from "./types";
import { workDraftPayload } from "./model";

export const WORK_REFERENCE_OPTIONS_ENDPOINT = "/api/modules/work/projects/reference-options";

async function readJson<T>(response: Response, fallbackError: string): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || fallbackError);
  return data as T;
}

export async function listTaskSpaces() {
  const response = await fetch(workspacePath("/api/modules/work/tasks/spaces"));
  const data = await readJson<{ spaces?: WorkTaskSpace[] }>(response, "加载工作空间失败");
  return data.spaces || [];
}

export async function listWorkItems(target: WorkTarget) {
  const params = new URLSearchParams({
    targetType: target.targetType,
    targetId: String(target.targetId),
    includeArchived: "true",
  });
  const response = await fetch(workspacePath(`/api/modules/work/tasks?${params.toString()}`));
  const data = await readJson<{ works?: WorkItem[] }>(response, "加载工作计划失败");
  return data.works || [];
}

export async function createWorkItem(target: WorkTarget, draft: WorkItemDraft) {
  const response = await fetch(workspacePath("/api/modules/work/tasks"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...workDraftPayload(draft), ...target }),
  });
  return readJson<{ work: WorkItem }>(response, "新建工作项失败");
}

export async function updateWorkItem(id: number, draft: Partial<WorkItemDraft> | Record<string, unknown>) {
  const response = await fetch(workspacePath(`/api/modules/work/tasks/${id}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify("content" in draft ? workDraftPayload(draft as WorkItemDraft) : draft),
  });
  return readJson<{ work: WorkItem }>(response, "保存工作项失败");
}

export async function deleteWorkItem(id: number) {
  const response = await fetch(workspacePath(`/api/modules/work/tasks/${id}`), { method: "DELETE" });
  return readJson<{ success: true }>(response, "删除工作项失败");
}

export async function listProjectTaskOptions(projectId: number | null) {
  if (!projectId) return [];
  const response = await fetch(workspacePath(`/api/modules/work/projects/${projectId}/tasks`));
  const data = await readJson<{ tasks?: Array<{ id: number; name?: string; description?: string }> }>(response, "加载项目任务失败");
  return (data.tasks || []).map((task) => ({
    value: String(task.id),
    label: task.name || task.description || `任务 ${task.id}`,
  }));
}

export async function listProjectPhaseOptions(projectId: number | null) {
  if (!projectId) return [];
  const response = await fetch(workspacePath(`/api/modules/work/projects/${projectId}/plan-phases`));
  const data = await readJson<{ phases?: Array<{ id: number; name?: string }> }>(response, "加载项目阶段失败");
  return (data.phases || []).map((phase) => ({
    value: String(phase.id),
    label: phase.name || `阶段 ${phase.id}`,
  }));
}

export async function listSpacePermissions(target: WorkTarget) {
  const response = await fetch(workspacePath(`/api/modules/work/tasks/spaces/${target.targetType}/${target.targetId}/permissions`));
  const data = await readJson<{ permissions?: WorkSpacePermissionRow[] }>(response, "加载空间权限失败");
  return data.permissions || [];
}

export async function saveSpacePermissions(target: WorkTarget, permissions: Array<{ userId: number; role: string }>) {
  const response = await fetch(workspacePath(`/api/modules/work/tasks/spaces/${target.targetType}/${target.targetId}/permissions`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ permissions }),
  });
  return readJson<{ success: true }>(response, "保存空间权限失败");
}

export async function getWorkReportDraft(target: WorkTarget, periodStart: string) {
  const params = new URLSearchParams({
    targetType: target.targetType,
    targetId: String(target.targetId),
    periodStart,
  });
  const response = await fetch(workspacePath(`/api/modules/work/tasks/reports?${params.toString()}`));
  return readJson<WorkReportDraftResponse>(response, "加载工作汇报失败");
}

export async function saveWorkReport(target: WorkTarget, periodStart: string, items: WorkReportItem[]) {
  const response = await fetch(workspacePath("/api/modules/work/tasks/reports"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...target,
      periodStart,
      items: items.map((item, index) => ({
        workItemId: item.workItemId,
        title: item.title,
        previousPlanSnapshot: item.previousPlanSnapshot,
        doneThisWeek: item.doneThisWeek,
        planNextWeek: item.planNextWeek,
        sortOrder: item.sortOrder || (index + 1) * 10,
      })),
    }),
  });
  return readJson<WorkReportDraftResponse>(response, "保存工作汇报失败");
}

export async function listWorkReportCollection(periodStart: string) {
  const params = new URLSearchParams({ periodStart });
  const response = await fetch(workspacePath(`/api/modules/work/tasks/reports/collection?${params.toString()}`));
  return readJson<WorkReportCollectionResponse>(response, "加载汇报汇总失败");
}
