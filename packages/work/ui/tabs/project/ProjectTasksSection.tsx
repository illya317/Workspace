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
  isDataTableEditDirty,
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
  onCreateChildProject,
  onToast,
}: {
  projectId: number | null;
  canEdit: boolean;
  disabled: boolean;
  onChanged?: () => void;
  onCreateChildProject?: (task: ProjectTaskItem) => void;
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
      cellClassName: "min-w-64 max-w-xl",
      render: (task) => (
        <div className="flex min-w-0 flex-col gap-1.5">
          {task.predecessorTaskNames.length > 0 && (
            <span className="max-w-full truncate text-xs text-slate-400" title={`前置：${task.predecessorTaskNames.join("、")}`}>前置：{task.predecessorTaskNames.join("、")}</span>
          )}
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 max-w-[16rem] truncate text-sm font-medium text-slate-900" title={task.name}>{task.name}</span>
            {task.isMilestone && <span className="shrink-0 rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">里程碑</span>}
          </div>
          {task.description && <span className="max-w-full truncate text-xs text-slate-400" title={task.description}>{task.description}</span>}
          {task.childProjectId && (
            <span className="max-w-full truncate text-xs text-emerald-700" title={`子项目：${[task.childProjectCode, task.childProjectName].filter(Boolean).join(" · ")}${task.childProjectStatus ? ` · ${task.childProjectStatus}` : ""}`}>
              子项目：{[task.childProjectCode, task.childProjectName].filter(Boolean).join(" · ")}
              {task.childProjectStatus ? ` · ${task.childProjectStatus}` : ""}
            </span>
          )}
          {task.successorTasks.length > 0 && (
            <span className="max-w-full truncate text-xs text-slate-400" title={`后置：${task.successorTasks.map((item) => item.name).join("、")}`}>后置：{task.successorTasks.map((item) => item.name).join("、")}</span>
          )}
        </div>
      ),
    },
    {
      key: "childProjectStatus",
      label: "派生状态",
      defaultVisible: true,
      render: (task) => (
        <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${statusClassName(task.childProjectStatus)}`}>
          {task.childProjectStatus || "未派生"}
        </span>
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
        const dirty = isDataTableEditDirty(createProjectTaskDraft(task), editDraft);
        return (
          <DataTableActionsCell
            actions={[
              ...createDataTableEditActions({
                row: task,
                editing,
                canEdit,
                canSave,
                dirty,
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
                key: "create-child-project",
                kind: "add",
                label: task.childProjectId ? "已有子项目" : "创建子项目",
                onClick: () => onCreateChildProject?.(task),
                disabled: saving || disabled || Boolean(task.childProjectId) || !onCreateChildProject,
              } as const, {
                key: "delete",
                kind: "delete",
                label: "删除任务",
                onClick: () => void handleDelete(task),
                disabled: saving || disabled || Boolean(task.childProjectId),
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
    if (task.childProjectId) return onToast({ type: "error", message: "请先处理相关子项目" });
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
            visibleColumns={["owner", "childProjectStatus", "startDate", "endDate"]}
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

function statusClassName(status: string | null) {
  if (status === "已完成") return "bg-emerald-50 text-emerald-700";
  if (status === "进行中") return "bg-sky-50 text-sky-700";
  if (status === "未开始") return "bg-slate-100 text-slate-600";
  return "bg-slate-50 text-slate-400";
}

function nextSortOrder(tasks: ProjectTaskItem[]) {
  return (tasks.reduce((max, task) => Math.max(max, task.sortOrder), 0) || 0) + 10;
}

function isTaskDraftSubmittable(draft: ProjectTaskDraft) {
  return Boolean(draft.name.trim());
}
