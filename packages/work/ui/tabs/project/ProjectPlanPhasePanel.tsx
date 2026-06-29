"use client";

import { useState } from "react";
import { createFormSection, createPageBody, type BodySurfaceSectionSpec, type DataSurfaceColumnSpec, type DataSurfaceProps, type FormSurfaceItemSpec, PageSurface, type SurfaceDataRowEditActionSpec, useFeedback } from "@workspace/core/ui";
import { createProjectPlanPhase, deleteProjectPlanPhase, updateProjectPlanPhase } from "./api";
import type { ProjectPlanPhaseItem } from "./plan-gantt-model";

type PhaseDraft = {
  name: string;
  startDate: string;
  endDate: string;
  note: string;
};

const EMPTY_DRAFT: PhaseDraft = { name: "", startDate: "", endDate: "", note: "" };

export function useProjectPlanPhaseSection({
  projectId,
  phases,
  canEdit,
  disabled,
  onChanged,
}: {
  projectId: number | null;
  phases: ProjectPlanPhaseItem[];
  canEdit: boolean;
  disabled?: boolean;
  onChanged: () => Promise<void>;
}): BodySurfaceSectionSpec {
  const feedback = useFeedback();
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<PhaseDraft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<PhaseDraft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);

  async function submitCreate() {
    if (!projectId || !draft.name.trim()) return;
    setBusy(true);
    try {
      await createProjectPlanPhase(projectId, phasePayload(draft));
      setDraft(EMPTY_DRAFT);
      setCreating(false);
      await onChanged();
    } catch (err) {
      await feedback.confirm({ title: "新建项目阶段失败", message: err instanceof Error ? err.message : "新建项目阶段失败", confirmLabel: "关闭", confirmDanger: true, showCancel: false });
    } finally {
      setBusy(false);
    }
  }

  function startEdit(phase: ProjectPlanPhaseItem) {
    setEditingId(phase.id);
    setEditDraft(phaseDraftFromItem(phase));
  }

  async function submitEdit(phaseId: number) {
    if (!projectId || !editDraft.name.trim()) return;
    setBusy(true);
    try {
      await updateProjectPlanPhase(projectId, phaseId, phasePayload(editDraft));
      setEditingId(null);
      setEditDraft(EMPTY_DRAFT);
      await onChanged();
    } catch (err) {
      await feedback.confirm({ title: "保存项目阶段失败", message: err instanceof Error ? err.message : "保存项目阶段失败", confirmLabel: "关闭", confirmDanger: true, showCancel: false });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(phaseId: number) {
    if (!projectId) return;
    const confirmed = await feedback.confirmDelete({ message: "删除项目阶段后，已归属到该阶段的任务会直接显示在项目下。确定删除吗？" });
    if (!confirmed) return;
    setBusy(true);
    try {
      await deleteProjectPlanPhase(projectId, phaseId);
      await onChanged();
    } catch (err) {
      await feedback.confirm({ title: "删除项目阶段失败", message: err instanceof Error ? err.message : "删除项目阶段失败", confirmLabel: "关闭", confirmDanger: true, showCancel: false });
    } finally {
      setBusy(false);
    }
  }

  if (!projectId) {
    return {
      key: "project-phases-empty",
      header: { title: "项目阶段" },
      body: { kind: "record", record: { records: [], empty: "项目保存后可维护项目阶段。" } },
    };
  }

  return {
    key: "project-phases",
    label: "项目阶段",
    header: {
      title: "项目阶段",
      actions: canEdit && !creating ? [{
        key: "create",
        label: "新增项目阶段",
        icon: "create",
        variant: "primary",
        disabled: disabled || busy,
        onClick: () => setCreating(true),
      }] : undefined,
    },
    body: {
        kind: "section",
        sections: createPageBody([
          ...(creating ? [createFormSection("create-phase", {
            kind: "fields",
            content: {
              items: phaseFields(draft, disabled || busy, setDraft),
              layout: { columns: 2 },
            },
            commands: [
              {
                key: "cancel",
                label: "取消",
                icon: "cancel",
                disabled: disabled || busy,
                onClick: () => {
                  setCreating(false);
                  setDraft(EMPTY_DRAFT);
                },
              },
              {
                key: "submit",
                label: busy ? "保存中..." : "保存项目阶段",
                icon: "save",
                variant: "primary",
                disabled: disabled || busy || !draft.name.trim(),
                onClick: () => void submitCreate(),
              },
            ],
          })] : []),
          {
            key: "phase-rows",
            body: { kind: "data", data: buildPhaseRowsSurface({
              phases,
              canEdit,
              disabled: disabled || busy,
              editingId,
              editDraft,
              onEditDraftChange: setEditDraft,
              onStartEdit: startEdit,
              onCancelEdit: () => {
                setEditingId(null);
                setEditDraft(EMPTY_DRAFT);
              },
              onSubmitEdit: submitEdit,
              onDelete: handleDelete,
            }) },
          },
        ]).sections,
    },
  };
}

export default function ProjectPlanPhasePanel(props: {
  projectId: number;
  phases: ProjectPlanPhaseItem[];
  canEdit: boolean;
  disabled?: boolean;
  onChanged: () => Promise<void>;
}) {
  const section = useProjectPlanPhaseSection(props);
  return <PageSurface kind="standard" embedded body={createPageBody([section])} />;
}

function buildPhaseRowsSurface({
  phases,
  canEdit,
  disabled,
  editingId,
  editDraft,
  onEditDraftChange,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  onDelete,
}: {
  phases: ProjectPlanPhaseItem[];
  canEdit: boolean;
  disabled?: boolean;
  editingId: number | null;
  editDraft: PhaseDraft;
  onEditDraftChange: (draft: PhaseDraft) => void;
  onStartEdit: (phase: ProjectPlanPhaseItem) => void;
  onCancelEdit: () => void;
  onSubmitEdit: (phaseId: number) => void;
  onDelete: (phaseId: number) => void;
}): DataSurfaceProps<ProjectPlanPhaseItem> {
  const columns: DataSurfaceColumnSpec<ProjectPlanPhaseItem>[] = [
    {
      key: "sequenceNo",
      label: "序号",
      required: true,
      tone: "muted", width: "xs",
      cell: (phase) => <span className="font-semibold">{phase.sequenceNo}</span>,
    },
    {
      key: "name",
      label: "阶段",
      required: true,
      width: "md",
      cell: (phase) => <span className="break-words text-sm font-medium text-slate-900">{phase.name}</span>,
    },
    {
      key: "startDate",
      label: "开始时间",
      defaultVisible: true,
      cell: (phase) => phase.startDate || "未定",
    },
    {
      key: "endDate",
      label: "结束时间",
      defaultVisible: true,
      cell: (phase) => phase.endDate || "未定",
    },
    {
      key: "note",
      label: "说明",
      defaultVisible: true,
      tone: "muted", wrap: "wrap", width: "lg",
      cell: (phase) => phase.note || "",
    },
  ];

  return {
    kind: "table",
    rows: phases,
    columns,
    presentation: { density: "compact" },

    emptyText: "暂无项目阶段",
    rowKey: (phase) => phase.id,
    visibleColumns: ["startDate", "endDate", "note"],
    expandedRowKey: editingId,
    expandedRowContent: () => (
      <PageSurface kind="standard"
        embedded
        body={createPageBody([createFormSection("phase-edit-fields", {
          kind: "fields",
          content: {
            items: phaseFields(editDraft, disabled, onEditDraftChange),
            layout: { columns: 2 },
          },
        })])}
      />
    ),
    rowEditActions: canEdit ? (phase): SurfaceDataRowEditActionSpec<ProjectPlanPhaseItem> => ({
      editing: editingId === phase.id,
      canEdit,
      canSave: Boolean(editDraft.name.trim()),
      initial: phaseDraftFromItem(phase),
      current: editDraft,
      disabled,
      editLabel: "编辑阶段",
      saveLabel: "保存阶段",
      cancelLabel: "取消编辑",
      onEdit: onStartEdit,
      onSave: () => onSubmitEdit(phase.id),
      onCancel: onCancelEdit,
    }) : undefined,
    rowActions: canEdit ? (phase) => {
      if (editingId === phase.id) return [];
      return [{
        key: "delete",
        kind: "delete" as const,
        label: "删除阶段",
        onClick: () => onDelete(phase.id),
        disabled,
      }];
    } : undefined,
    scroll: { y: "hidden" },
  };
}

function phaseFields(
  draft: PhaseDraft,
  disabled: boolean | undefined,
  onChange: (draft: PhaseDraft) => void,
): FormSurfaceItemSpec[] {
  return [
    {
      key: "name",
      label: "阶段",
      spec: { valueType: "string", control: "text", state: disabled ? "disabled" : "normal" },
      value: draft.name,
      onChange: (value) => onChange({ ...draft, name: String(value ?? "") }),
      placeholder: "例如：方案确认",
    },
    {
      key: "note",
      label: "说明",
      spec: { valueType: "string", control: "text", state: disabled ? "disabled" : "normal" },
      value: draft.note,
      onChange: (value) => onChange({ ...draft, note: String(value ?? "") }),
    },
    {
      key: "startDate",
      label: "开始日期",
      spec: { valueType: "date", control: "temporal", precision: "date", state: disabled ? "disabled" : "normal" },
      value: draft.startDate || null,
      onChange: (value) => onChange({ ...draft, startDate: String(value || "") }),
      placeholder: "选择日期",
    },
    {
      key: "endDate",
      label: "结束日期",
      spec: { valueType: "date", control: "temporal", precision: "date", state: disabled ? "disabled" : "normal" },
      value: draft.endDate || null,
      onChange: (value) => onChange({ ...draft, endDate: String(value || "") }),
      placeholder: "选择日期",
    },
  ];
}

function phasePayload(draft: PhaseDraft) {
  return {
    name: draft.name.trim(),
    startDate: draft.startDate || null,
    endDate: draft.endDate || null,
    note: draft.note.trim() || null,
  };
}

function phaseDraftFromItem(phase: ProjectPlanPhaseItem): PhaseDraft {
  return {
    name: phase.name,
    startDate: phase.startDate ?? "",
    endDate: phase.endDate ?? "",
    note: phase.note ?? "",
  };
}
