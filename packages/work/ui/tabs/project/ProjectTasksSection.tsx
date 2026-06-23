"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BlockCreatePanel,
  DataTable,
  DataTableActionsCell,
  EmptyStateCard,
  SectionCard,
  TableScrollFrame,
  createDataTableEditActions,
  useConfirmDelete,
  type DataTableColumn,
  type PickerOption,
} from "@workspace/core/ui";
import {
  createProjectTask,
  deleteProjectTask,
  listProjectPlanGantt,
  listProjectTasks,
  updateProjectTask,
} from "./api";
import {
  createEmptyProjectTaskDraft,
  createProjectTaskDraft,
  type ProjectTaskDraft,
  type ProjectTaskItem,
} from "./model";
import { ProjectTaskDetail, ProjectTaskForm } from "./ProjectTaskFields";
import type { ProjectPlanPhaseItem } from "./plan-gantt-model";

export default function ProjectTasksSection({
  projectId,
  canEdit,
  disabled,
  onChanged,
  onToast,
}: {
  projectId: number | null;
  canEdit: boolean;
  disabled: boolean;
  onChanged?: () => void;
  onToast: (toast: { type: "success" | "error"; message: string }) => void;
}) {
  const confirmDelete = useConfirmDelete();
  const [tasks, setTasks] = useState<ProjectTaskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [phases, setPhases] = useState<ProjectPlanPhaseItem[]>([]);
  const [detailTaskId, setDetailTaskId] = useState<number | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [createDraft, setCreateDraft] = useState<ProjectTaskDraft>(() => createEmptyProjectTaskDraft());
  const [editDraft, setEditDraft] = useState<ProjectTaskDraft | null>(null);

  const loadTasks = useCallback(async () => {
    if (!projectId) {
      setTasks([]);
      return;
    }
    setLoading(true);
    try {
      const [nextTasks, plan] = await Promise.all([
        listProjectTasks(projectId),
        listProjectPlanGantt(projectId).catch(() => null),
      ]);
      setTasks(nextTasks);
      setPhases(plan?.phases ?? []);
    } catch (err) {
      onToast({ type: "error", message: err instanceof Error ? err.message : "加载项目任务失败" });
    } finally {
      setLoading(false);
    }
  }, [onToast, projectId]);

  useEffect(() => { void loadTasks(); }, [loadTasks]);

  useEffect(() => {
    setDetailTaskId(null);
    setEditingTaskId(null);
    setEditDraft(null);
    setCreatingTask(false);
  }, [projectId]);

  useEffect(() => {
    setCreateDraft(createEmptyProjectTaskDraft(nextSortOrder(tasks)));
  }, [tasks]);

  const taskOptions = useMemo<PickerOption[]>(
    () => tasks.map((task) => ({ value: String(task.id), label: task.name || task.description })),
    [tasks],
  );

  const columns: DataTableColumn<ProjectTaskItem>[] = [
    {
      key: "description",
      label: "任务名称",
      required: true,
      cellClassName: "min-w-64 max-w-xl whitespace-normal",
      render: (task) => (
        <div className="flex min-w-0 flex-col gap-1.5">
          {task.predecessorTaskNames.length > 0 && (
            <span className="text-xs text-slate-400">前置：{task.predecessorTaskNames.join("、")}</span>
          )}
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 break-words text-sm font-medium text-slate-900">{task.name}</span>
            {task.isMilestone && <span className="shrink-0 rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">里程碑</span>}
          </div>
          {task.description && <span className="text-xs text-slate-400">{task.description}</span>}
          {task.successorTasks.length > 0 && (
            <span className="text-xs text-slate-400">后置：{task.successorTasks.map((item) => item.name).join("、")}</span>
          )}
        </div>
      ),
    },
    {
      key: "owner",
      label: "负责人",
      defaultVisible: true,
      render: (task) => task.ownerEmployeeName || "未设置",
    },
    {
      key: "startDate",
      label: "开始时间",
      defaultVisible: true,
      render: (task) => task.startDate || "未定",
    },
    {
      key: "endDate",
      label: "完成时间",
      defaultVisible: true,
      render: (task) => task.endDate || "未定",
    },
    {
      key: "actions",
      label: "操作",
      required: true,
      render: (task) => {
        const editing = editingTaskId === task.id;
        const canSave = Boolean(editDraft && isTaskDraftSubmittable(editDraft));
        return (
          <DataTableActionsCell
            actions={[
              ...createDataTableEditActions({
                row: task,
                editing,
                canEdit,
                canSave,
                saving,
                disabled,
                editLabel: "编辑任务",
                saveLabel: "保存任务",
                cancelLabel: "取消编辑",
                onEdit: handleStartEdit,
                onSave: () => void handleUpdate(),
                onCancel: handleCancelEdit,
              }),
              ...(canEdit && !editing ? [{
                key: "delete",
                kind: "delete",
                label: "删除任务",
                onClick: () => void handleDelete(task),
                disabled: saving || disabled,
              } as const] : []),
            ]}
          />
        );
      },
    },
  ];

  async function reloadAfterSave(message: string) {
    await loadTasks();
    onChanged?.();
    onToast({ type: "success", message });
  }

  async function handleCreate() {
    if (!projectId || saving) return;
    const draft = { ...createDraft, sortOrder: createDraft.sortOrder ?? nextSortOrder(tasks) };
    if (!draft.name.trim()) return onToast({ type: "error", message: "任务名称不能为空" });
    if (!draft.planPhaseId) return onToast({ type: "error", message: "项目阶段为必填，请先选择项目阶段" });
    setSaving(true);
    try {
      await createProjectTask(projectId, draft);
      setCreateDraft(createEmptyProjectTaskDraft(nextSortOrder(tasks)));
      setCreatingTask(false);
      await reloadAfterSave("项目任务已新建");
    } catch (err) {
      onToast({ type: "error", message: err instanceof Error ? err.message : "新建项目任务失败" });
    } finally {
      setSaving(false);
    }
  }

  function handleToggleDetail(task: ProjectTaskItem) {
    if (editingTaskId === task.id) return;
    setDetailTaskId((current) => current === task.id ? null : task.id);
    setEditingTaskId(null);
    setEditDraft(null);
  }

  function handleStartEdit(task: ProjectTaskItem) {
    if (saving || disabled) return;
    setDetailTaskId(task.id);
    setEditingTaskId(task.id);
    setEditDraft(createProjectTaskDraft(task));
    setCreatingTask(false);
  }

  function handleCancelEdit() {
    setEditingTaskId(null);
    setEditDraft(null);
  }

  async function handleUpdate() {
    if (!projectId || !editingTaskId || !editDraft || saving) return;
    if (!editDraft.name.trim()) return onToast({ type: "error", message: "任务名称不能为空" });
    if (!editDraft.planPhaseId) return onToast({ type: "error", message: "项目阶段为必填，请先选择项目阶段" });
    setSaving(true);
    try {
      await updateProjectTask(projectId, editingTaskId, editDraft);
      setEditingTaskId(null);
      setEditDraft(null);
      await reloadAfterSave("项目任务已保存");
    } catch (err) {
      onToast({ type: "error", message: err instanceof Error ? err.message : "保存项目任务失败" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(task: ProjectTaskItem) {
    if (!projectId || saving) return;
    const ok = await confirmDelete({
      title: "删除任务",
      message: `确定删除任务「${task.name}」吗？后置任务的前置关系会自动清空。`,
      confirmLabel: "删除任务",
    });
    if (!ok) return;
    setSaving(true);
    try {
      await deleteProjectTask(projectId, task.id);
      if (detailTaskId === task.id) setDetailTaskId(null);
      if (editingTaskId === task.id) {
        setEditingTaskId(null);
        setEditDraft(null);
      }
      await reloadAfterSave("项目任务已删除");
    } catch (err) {
      onToast({ type: "error", message: err instanceof Error ? err.message : "删除项目任务失败" });
    } finally {
      setSaving(false);
    }
  }

  if (!projectId) {
    return (
      <SectionCard title="项目任务">
        <EmptyStateCard compact>项目保存后可维护任务计划。</EmptyStateCard>
      </SectionCard>
    );
  }

  return (
    <BlockCreatePanel
      title="项目任务"
      canCreate={canEdit}
      creating={creatingTask}
      disabled={disabled || saving}
      submitting={saving}
      submitDisabled={disabled || saving || !isTaskDraftSubmittable(createDraft)}
      addLabel="新增任务"
      submitLabel="保存任务"
      onStartCreate={() => setCreatingTask(true)}
      onCancelCreate={() => setCreatingTask(false)}
      onSubmitCreate={() => void handleCreate()}
      createContent={<ProjectTaskForm draft={createDraft} disabled={disabled || saving} taskOptions={taskOptions} phases={phases} tasks={tasks} excludedTaskId={null} framed={false} onChange={setCreateDraft} />}
    >
        <TableScrollFrame className="overflow-y-hidden">
          <DataTable
            rows={tasks}
            columns={columns}
            density="compact"
            loading={loading}
            emptyText="暂无项目任务"
            rowKey={(task) => task.id}
            onRowClick={handleToggleDetail}
            visibleColumns={["owner", "startDate", "endDate"]}
            expandedRowKey={detailTaskId}
            renderExpandedRow={(task) => editDraft && editingTaskId === task.id ? (
              <ProjectTaskForm
                draft={editDraft}
                disabled={disabled || saving}
                taskOptions={taskOptions}
                phases={phases}
                tasks={tasks}
                excludedTaskId={task.id}
                onChange={setEditDraft}
              />
            ) : <ProjectTaskDetail task={task} />}
          />
        </TableScrollFrame>
    </BlockCreatePanel>
  );
}

function nextSortOrder(tasks: ProjectTaskItem[]) {
  return (tasks.reduce((max, task) => Math.max(max, task.sortOrder), 0) || 0) + 10;
}

function isTaskDraftSubmittable(draft: ProjectTaskDraft) {
  return Boolean(draft.name.trim() && draft.planPhaseId);
}
