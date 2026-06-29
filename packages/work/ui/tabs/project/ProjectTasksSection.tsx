"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPageBody, type DataSurfaceColumnSpec, type DataSurfaceProps, PageSurface, type SurfaceDataRowEditActionSpec, type SurfacePickerOptionSpec, useFeedback } from "@workspace/core/ui";
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
  const feedback = useFeedback();
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

  const taskOptions = useMemo<SurfacePickerOptionSpec[]>(
    () => tasks.map((task) => ({ value: String(task.id), label: task.name || task.description })),
    [tasks],
  );

  const columns: DataSurfaceColumnSpec<ProjectTaskItem>[] = [
    {
      key: "description",
      label: "任务名称",
      required: true,
      width: "lg",
      cell: (task) => (
        <div className="flex min-w-0 flex-col gap-1.5">
          {task.predecessorTaskNames.length > 0 && (
            <span className="max-w-full truncate text-xs text-slate-400" title={`前置：${task.predecessorTaskNames.join("、")}`}>前置：{task.predecessorTaskNames.join("、")}</span>
          )}
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 max-w-64 truncate text-sm font-medium text-slate-900" title={task.name}>{task.name}</span>
            {task.isMilestone && <span className="shrink-0 rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">里程碑</span>}
          </div>
          {task.description && <span className="max-w-full truncate text-xs text-slate-400" title={task.description}>{task.description}</span>}
          {task.childProjectId && (
            <span className="max-w-full truncate text-xs text-emerald-700" title={`子项目：${[task.childProjectCode, task.childProjectName].filter(Boolean).join(" · ")}${task.childProjectStatus ? ` · ${task.childProjectStatus}` : ""}`}>
              子项目：{[task.childProjectCode, task.childProjectName].filter(Boolean).join(" · ")}
              {task.childProjectStatus ? ` · ${task.childProjectStatus}` : ""}
            </span>
          )}
          {(task.sourceMeetingDecisionTitle || task.sourceMeetingActionCandidateTitle) && (
            <span className="max-w-full truncate text-xs text-indigo-600" title={meetingSourceTitle(task)}>
              会议依据：{meetingSourceTitle(task)}
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
      label: "派生子项目",
      defaultVisible: true,
      cell: (task) => (
        task.childProjectId ? (
          <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${statusClassName(task.childProjectStatus)}`}>
            {task.childProjectStatus || "已派生"}
          </span>
        ) : {
          kind: "action" as const,
          action: {
            key: "create-child-project",
            label: "+",
            size: "sm",
            variant: "primary" as const,
            disabled: saving || disabled || !canEdit || !onCreateChildProject,
            onClick: () => onCreateChildProject?.(task),
          },
        }
      ),
    },
    {
      key: "owner",
      label: "负责人",
      defaultVisible: true,
      cell: (task) => task.ownerEmployeeName || "未设置",
    },
    {
      key: "startDate",
      label: "开始时间",
      defaultVisible: true,
      cell: (task) => task.startDate || "未定",
    },
    {
      key: "endDate",
      label: "完成时间",
      defaultVisible: true,
      cell: (task) => task.endDate || "未定",
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
    const ok = await feedback.confirmDelete({
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

  return (
    <PageSurface kind="standard"
      embedded
      body={{
        kind: "section",
        sections: [
          {
            key: "project-tasks",
            label: "项目任务",
            header: {
              title: "项目任务",
              actions: projectId && canEdit && !creatingTask ? [{
                key: "create",
                label: "新增任务",
                icon: "create",
                variant: "primary",
                disabled: disabled || saving,
                onClick: () => setCreatingTask(true),
              }] : undefined,
            },
            body: {
              kind: "section",
              sections: createPageBody(!projectId ? [
                {
                  key: "project-tasks-empty",
                  header: { title: "项目任务" },
                  body: { kind: "record", record: { records: [], empty: "项目保存后可维护任务计划。" } },
                },
              ] : [
                ...(creatingTask ? [{
	                  key: "create-task",
	                  body: {
	                    kind: "section" as const,
	                    surface: {
	                      kind: "section" as const,
	                      title: "新增任务",
                      actions: [
                        { key: "cancel", label: "取消", disabled: disabled || saving, onClick: () => setCreatingTask(false) },
                        { key: "submit", label: saving ? "保存中..." : "保存任务", variant: "primary" as const, disabled: disabled || saving || !isTaskDraftSubmittable(createDraft), onClick: () => void handleCreate() },
                      ],
                      content: <ProjectTaskForm draft={createDraft} disabled={disabled || saving} taskOptions={taskOptions} phases={phases} tasks={tasks} excludedTaskId={null} framed={false} onChange={setCreateDraft} />,
                    },
                  },
                }] : []),
                {
                  key: "task-table",
                  body: { kind: "data", data: buildProjectTaskTableSurface({
                    tasks,
                    columns,
                    loading,
                    detailTaskId,
                    editDraft,
                    editingTaskId,
                    disabled,
                    saving,
                    canEdit,
                    taskOptions,
                    phases,
                    onRowClick: handleToggleDetail,
                    onEditDraftChange: setEditDraft,
                    onStartEdit: handleStartEdit,
                    onSave: handleUpdate,
                    onCancelEdit: handleCancelEdit,
                    onDelete: handleDelete,
                  }) },
                },
              ]).sections,
            },
          },
        ],
      }}
    />
  );
}

function buildProjectTaskTableSurface({
  tasks,
  columns,
  loading,
  detailTaskId,
  editDraft,
  editingTaskId,
  disabled,
  saving,
  canEdit,
  taskOptions,
  phases,
  onRowClick,
  onEditDraftChange,
  onStartEdit,
  onSave,
  onCancelEdit,
  onDelete,
}: {
  tasks: ProjectTaskItem[];
  columns: DataSurfaceColumnSpec<ProjectTaskItem>[];
  loading: boolean;
  detailTaskId: number | null;
  editDraft: ProjectTaskDraft | null;
  editingTaskId: number | null;
  disabled: boolean;
  saving: boolean;
  canEdit: boolean;
  taskOptions: SurfacePickerOptionSpec[];
  phases: ProjectPlanPhaseItem[];
  onRowClick: (task: ProjectTaskItem) => void;
  onEditDraftChange: (draft: ProjectTaskDraft) => void;
  onStartEdit: (task: ProjectTaskItem) => void;
  onSave: () => void;
  onCancelEdit: () => void;
  onDelete: (task: ProjectTaskItem) => void;
}): DataSurfaceProps<ProjectTaskItem> {
  return {
    kind: "table",
    rows: tasks,
    columns,
    presentation: { density: "compact" },

    loading,
    emptyText: "暂无项目任务",
    rowKey: (task) => task.id,
    onRowClick,
    visibleColumns: ["owner", "childProjectStatus", "startDate", "endDate"],
    expandedRowKey: detailTaskId,
    expandedRowContent: (task) => editDraft && editingTaskId === task.id ? (
      <ProjectTaskForm
        draft={editDraft}
        disabled={disabled || saving}
        taskOptions={taskOptions}
        phases={phases}
        tasks={tasks}
        excludedTaskId={task.id}
        onChange={onEditDraftChange}
      />
    ) : <ProjectTaskDetail task={task} />,
    rowEditActions: (task): SurfaceDataRowEditActionSpec<ProjectTaskItem> => ({
      editing: editingTaskId === task.id,
      canEdit,
      canSave: Boolean(editDraft && isTaskDraftSubmittable(editDraft)),
      initial: createProjectTaskDraft(task),
      current: editDraft,
      saving,
      disabled,
      editLabel: "编辑任务",
      saveLabel: "保存任务",
      cancelLabel: "取消编辑",
      onEdit: onStartEdit,
      onSave: () => void onSave(),
      onCancel: onCancelEdit,
    }),
    rowActions: (task) => {
      if (!canEdit || editingTaskId === task.id) return [];
      return [
        {
          key: "delete",
          kind: "delete" as const,
          label: "删除任务",
          onClick: () => void onDelete(task),
          disabled: saving || disabled || Boolean(task.childProjectId),
        },
      ];
    },
    scroll: { y: "hidden" },
  };
}

function statusClassName(status: string | null) {
  if (status === "已完成") return "bg-emerald-50 text-emerald-700";
  if (status === "进行中") return "bg-sky-50 text-sky-700";
  if (status === "未开始") return "bg-slate-100 text-slate-600";
  return "bg-slate-50 text-slate-400";
}

function meetingSourceTitle(task: ProjectTaskItem) {
  return [task.sourceMeetingDecisionTitle, task.sourceMeetingActionCandidateTitle].filter(Boolean).join(" / ");
}

function nextSortOrder(tasks: ProjectTaskItem[]) {
  return (tasks.reduce((max, task) => Math.max(max, task.sortOrder), 0) || 0) + 10;
}

function isTaskDraftSubmittable(draft: ProjectTaskDraft) {
  return Boolean(draft.name.trim());
}
