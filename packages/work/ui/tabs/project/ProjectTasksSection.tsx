"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionButton,
  DataTable,
  DataTableActionsCell,
  EmptyStateCard,
  FkFieldInput,
  FormField,
  OptionPicker,
  SectionCard,
  TableScrollFrame,
  TextareaField,
  getFieldInputClassName,
  useConfirmDelete,
  type DataTableColumn,
  type FkFieldOption,
  type PickerOption,
} from "@workspace/core/ui";
import CalendarDateInput from "@workspace/core/ui/CalendarDateInput";
import {
  createProjectTask,
  deleteProjectTask,
  listProjectTasks,
  updateProjectTask,
} from "./api";
import {
  PROJECT_MILESTONE_PICKER_OPTIONS,
  createEmptyProjectTaskDraft,
  createProjectTaskDraft,
  type ProjectTaskDraft,
  type ProjectTaskItem,
} from "./model";
import { WORK_REFERENCE_OPTIONS_ENDPOINT } from "./reference-options";

const inputClassName = getFieldInputClassName("h-10");
const pickerButtonClassName = `${inputClassName} text-left`;
const pickerPopoverClassName = "absolute left-0 top-[calc(100%+0.35rem)] z-50 w-full min-w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-xl";

export default function ProjectTasksSection({
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
  const confirmDelete = useConfirmDelete();
  const [tasks, setTasks] = useState<ProjectTaskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
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
      setTasks(await listProjectTasks(projectId));
    } catch (err) {
      onToast({ type: "error", message: err instanceof Error ? err.message : "加载项目任务失败" });
    } finally {
      setLoading(false);
    }
  }, [onToast, projectId]);

  useEffect(() => { void loadTasks(); }, [loadTasks]);

  useEffect(() => {
    setEditingTaskId(null);
    setEditDraft(null);
    setCreateDraft(createEmptyProjectTaskDraft(nextSortOrder(tasks)));
  }, [projectId, tasks]);

  const taskOptions = useMemo<PickerOption[]>(
    () => tasks.map((task) => ({ value: String(task.id), label: task.description })),
    [tasks],
  );

  const columns: DataTableColumn<ProjectTaskItem>[] = [
    {
      key: "description",
      label: "任务描述",
      required: true,
      cellClassName: "min-w-64 max-w-xl whitespace-normal",
      render: (task) => (
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            {task.isMilestone && <span className="shrink-0 rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">里程碑</span>}
            <span className="min-w-0 break-words text-sm font-medium text-slate-900">{task.description}</span>
          </div>
          {task.successorTasks.length > 0 && (
            <span className="text-xs text-slate-400">后置：{task.successorTasks.map((item) => item.description).join("、")}</span>
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
      key: "dates",
      label: "起止时间",
      defaultVisible: true,
      render: (task) => `${task.startDate || "未定"} - ${task.endDate || "未定"}`,
    },
    {
      key: "predecessor",
      label: "前置任务",
      defaultVisible: true,
      cellClassName: "max-w-xs truncate",
      render: (task) => task.predecessorTaskName || "无",
    },
    {
      key: "actions",
      label: "操作",
      required: true,
      render: (task) => canEdit ? (
        <DataTableActionsCell
          actions={[
            {
              key: "edit",
              kind: "edit",
              label: "编辑任务",
              onClick: () => {
                setEditingTaskId(task.id);
                setEditDraft(createProjectTaskDraft(task));
              },
              disabled: saving || disabled,
            },
            {
              key: "delete",
              kind: "delete",
              label: "删除任务",
              onClick: () => void handleDelete(task),
              disabled: saving || disabled,
            },
          ]}
        />
      ) : "只读",
    },
  ];

  async function reloadAfterSave(message: string) {
    await loadTasks();
    onToast({ type: "success", message });
  }

  async function handleCreate() {
    if (!projectId || saving) return;
    const draft = { ...createDraft, sortOrder: createDraft.sortOrder ?? nextSortOrder(tasks) };
    if (!draft.description.trim()) return onToast({ type: "error", message: "任务描述不能为空" });
    setSaving(true);
    try {
      await createProjectTask(projectId, draft);
      setCreateDraft(createEmptyProjectTaskDraft(nextSortOrder(tasks)));
      await reloadAfterSave("项目任务已新建");
    } catch (err) {
      onToast({ type: "error", message: err instanceof Error ? err.message : "新建项目任务失败" });
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate() {
    if (!projectId || !editingTaskId || !editDraft || saving) return;
    if (!editDraft.description.trim()) return onToast({ type: "error", message: "任务描述不能为空" });
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
      message: `确定删除任务「${task.description}」吗？后置任务的前置关系会自动清空。`,
      confirmLabel: "删除任务",
    });
    if (!ok) return;
    setSaving(true);
    try {
      await deleteProjectTask(projectId, task.id);
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
    <SectionCard title="项目任务" subtitle="任务只记录前置依赖，后置任务由系统反向计算。">
      <div className="space-y-4">
        {canEdit && (
          <ProjectTaskForm
            draft={createDraft}
            disabled={disabled || saving}
            taskOptions={taskOptions}
            excludedTaskId={null}
            submitLabel={saving ? "保存中..." : "新增任务"}
            onChange={setCreateDraft}
            onSubmit={() => void handleCreate()}
          />
        )}

        <TableScrollFrame>
          <DataTable
            rows={tasks}
            columns={columns}
            visibleColumns={["owner", "dates", "predecessor"]}
            density="compact"
            loading={loading}
            emptyText="暂无项目任务"
            rowKey={(task) => task.id}
            expandedRowKey={editingTaskId}
            renderExpandedRow={(task) => editDraft && editingTaskId === task.id ? (
              <ProjectTaskForm
                draft={editDraft}
                disabled={disabled || saving}
                taskOptions={taskOptions}
                excludedTaskId={task.id}
                submitLabel={saving ? "保存中..." : "保存任务"}
                onChange={setEditDraft}
                onSubmit={() => void handleUpdate()}
                onCancel={() => {
                  setEditingTaskId(null);
                  setEditDraft(null);
                }}
              />
            ) : null}
          />
        </TableScrollFrame>
      </div>
    </SectionCard>
  );
}

function ProjectTaskForm({
  draft,
  disabled,
  taskOptions,
  excludedTaskId,
  submitLabel,
  onChange,
  onSubmit,
  onCancel,
}: {
  draft: ProjectTaskDraft;
  disabled: boolean;
  taskOptions: PickerOption[];
  excludedTaskId: number | null;
  submitLabel: string;
  onChange: (draft: ProjectTaskDraft) => void;
  onSubmit: () => void;
  onCancel?: () => void;
}) {
  const predecessorOptions = taskOptions.filter((option) => option.value !== String(excludedTaskId));

  function patch(next: Partial<ProjectTaskDraft>) {
    onChange({ ...draft, ...next });
  }

  function setOwner(option?: FkFieldOption) {
    patch({
      ownerEmployeeId: option?.id ?? null,
      ownerEmployeeNumber: option?.subtitle ?? null,
      ownerEmployeeName: option?.name ?? null,
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        <FormField label="任务描述" required className="lg:col-span-2">
          <TextareaField
            value={draft.description}
            disabled={disabled}
            rows={2}
            className="text-sm"
            onChange={(value) => patch({ description: value })}
          />
        </FormField>
        <FormField label="负责人">
          <FkFieldInput
            fkKey="work.projects.member.employee"
            endpoint={WORK_REFERENCE_OPTIONS_ENDPOINT}
            value={draft.ownerEmployeeNumber || ""}
            displayValue={draft.ownerEmployeeName || ""}
            disabled={disabled}
            placeholder="搜索负责人"
            onChange={(_label, option) => setOwner(option)}
          />
        </FormField>
        <FormField label="是否里程碑">
          <OptionPicker
            value={draft.isMilestone ? "true" : "false"}
            options={PROJECT_MILESTONE_PICKER_OPTIONS}
            disabled={disabled}
            onChange={(value) => patch({ isMilestone: value === "true" })}
            visibleCount={2}
            buttonClassName={pickerButtonClassName}
            popoverClassName={pickerPopoverClassName}
          />
        </FormField>
        <DateField label="开始时间" value={draft.startDate} disabled={disabled} onChange={(value) => patch({ startDate: value })} />
        <DateField label="结束时间" value={draft.endDate} disabled={disabled} onChange={(value) => patch({ endDate: value })} />
        <FormField label="前置任务" className="lg:col-span-2">
          <OptionPicker
            value={draft.predecessorTaskId ? String(draft.predecessorTaskId) : null}
            options={predecessorOptions}
            disabled={disabled || predecessorOptions.length === 0}
            placeholder="无"
            onChange={(value) => patch({ predecessorTaskId: value ? Number(value) : null })}
            visibleCount={6}
            buttonClassName={pickerButtonClassName}
            popoverClassName={pickerPopoverClassName}
          />
        </FormField>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {onCancel && <ActionButton disabled={disabled} onClick={onCancel}>取消</ActionButton>}
        <ActionButton variant="primary" disabled={disabled} onClick={onSubmit}>{submitLabel}</ActionButton>
      </div>
    </div>
  );
}

function DateField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string | null;
  disabled: boolean;
  onChange: (value: string | null) => void;
}) {
  return (
    <FormField label={label}>
      <CalendarDateInput
        value={value}
        disabled={disabled}
        onChange={onChange}
        className={inputClassName}
      />
    </FormField>
  );
}

function nextSortOrder(tasks: ProjectTaskItem[]) {
  return (tasks.reduce((max, task) => Math.max(max, task.sortOrder), 0) || 0) + 10;
}
