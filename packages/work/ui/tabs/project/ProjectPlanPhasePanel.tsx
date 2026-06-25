"use client";

import { useState } from "react";
import {
  BlockCreatePanel,
  CalendarDateInput,
  DataTable,
  DataTableActionsCell,
  EmptyStateCard,
  FormField,
  PanelCard,
  TableScrollFrame,
  TextField,
  createDataTableEditActions,
  isDataTableEditDirty,
  useConfirm,
  useConfirmDelete,
  type DataTableColumn,
} from "@workspace/core/ui";
import { createProjectPlanPhase, deleteProjectPlanPhase, updateProjectPlanPhase } from "./api";
import type { ProjectPlanPhaseItem } from "./plan-gantt-model";

type PhaseDraft = {
  name: string;
  startDate: string;
  endDate: string;
  note: string;
};

const EMPTY_DRAFT: PhaseDraft = { name: "", startDate: "", endDate: "", note: "" };

export default function ProjectPlanPhasePanel({
  projectId,
  phases,
  canEdit,
  disabled,
  onChanged,
}: {
  projectId: number;
  phases: ProjectPlanPhaseItem[];
  canEdit: boolean;
  disabled?: boolean;
  onChanged: () => Promise<void>;
}) {
  const confirm = useConfirm();
  const confirmDelete = useConfirmDelete();
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<PhaseDraft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<PhaseDraft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);

  async function submitCreate() {
    if (!draft.name.trim()) return;
    setBusy(true);
    try {
      await createProjectPlanPhase(projectId, phasePayload(draft));
      setDraft(EMPTY_DRAFT);
      setCreating(false);
      await onChanged();
    } catch (err) {
      await confirm({ title: "新建项目阶段失败", message: err instanceof Error ? err.message : "新建项目阶段失败", confirmLabel: "关闭", confirmDanger: true, showCancel: false });
    } finally {
      setBusy(false);
    }
  }

  function startEdit(phase: ProjectPlanPhaseItem) {
    setEditingId(phase.id);
    setEditDraft(phaseDraftFromItem(phase));
  }

  async function submitEdit(phaseId: number) {
    if (!editDraft.name.trim()) return;
    setBusy(true);
    try {
      await updateProjectPlanPhase(projectId, phaseId, phasePayload(editDraft));
      setEditingId(null);
      setEditDraft(EMPTY_DRAFT);
      await onChanged();
    } catch (err) {
      await confirm({ title: "保存项目阶段失败", message: err instanceof Error ? err.message : "保存项目阶段失败", confirmLabel: "关闭", confirmDanger: true, showCancel: false });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(phaseId: number) {
    const confirmed = await confirmDelete({ message: "删除项目阶段后，已归属到该阶段的任务会直接显示在项目下。确定删除吗？" });
    if (!confirmed) return;
    setBusy(true);
    try {
      await deleteProjectPlanPhase(projectId, phaseId);
      await onChanged();
    } catch (err) {
      await confirm({ title: "删除项目阶段失败", message: err instanceof Error ? err.message : "删除项目阶段失败", confirmLabel: "关闭", confirmDanger: true, showCancel: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <BlockCreatePanel
      title="项目阶段"
      creating={creating}
      canCreate={canEdit}
      disabled={disabled || busy}
      submitting={busy}
      submitDisabled={!draft.name.trim()}
      addLabel="新增项目阶段"
      submitLabel="保存项目阶段"
      onStartCreate={() => setCreating(true)}
      onCancelCreate={() => {
        setCreating(false);
        setDraft(EMPTY_DRAFT);
      }}
      onSubmitCreate={submitCreate}
      createContent={(
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.4fr_minmax(0,2fr)]">
          <PhaseFields draft={draft} disabled={disabled || busy} onChange={setDraft} />
        </div>
      )}
      bodyClassName="p-4"
      createClassName="rounded-lg border border-slate-200 bg-white p-3"
    >
      <PhaseRows
        phases={phases}
        canEdit={canEdit}
        disabled={disabled || busy}
        editingId={editingId}
        editDraft={editDraft}
        onEditDraftChange={setEditDraft}
        onStartEdit={startEdit}
        onCancelEdit={() => {
          setEditingId(null);
          setEditDraft(EMPTY_DRAFT);
        }}
        onSubmitEdit={submitEdit}
        onDelete={handleDelete}
      />
    </BlockCreatePanel>
  );
}

function PhaseRows({
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
}) {
  const columns: DataTableColumn<ProjectPlanPhaseItem>[] = [
    {
      key: "sequenceNo",
      label: "序号",
      required: true,
      cellClassName: "w-20 text-slate-400",
      render: (phase) => <span className="font-semibold">{phase.sequenceNo}</span>,
    },
    {
      key: "name",
      label: "阶段",
      required: true,
      cellClassName: "min-w-40",
      render: (phase) => <span className="break-words text-sm font-medium text-slate-900">{phase.name}</span>,
    },
    {
      key: "startDate",
      label: "开始时间",
      defaultVisible: true,
      render: (phase) => phase.startDate || "未定",
    },
    {
      key: "endDate",
      label: "结束时间",
      defaultVisible: true,
      render: (phase) => phase.endDate || "未定",
    },
    {
      key: "note",
      label: "说明",
      defaultVisible: true,
      cellClassName: "min-w-64 max-w-xl whitespace-normal text-slate-500",
      render: (phase) => phase.note || "",
    },
    {
      key: "actions",
      label: "操作",
      required: true,
      render: (phase) => {
        const editing = editingId === phase.id;
        const dirty = isDataTableEditDirty(phaseDraftFromItem(phase), editDraft);
        return canEdit ? (
          <DataTableActionsCell
            actions={[
              ...createDataTableEditActions({
                row: phase,
                editing,
                canEdit,
                canSave: Boolean(editDraft.name.trim()),
                dirty,
                disabled,
                editLabel: "编辑阶段",
                saveLabel: "保存阶段",
                cancelLabel: "取消编辑",
                onEdit: onStartEdit,
                onSave: () => onSubmitEdit(phase.id),
                onCancel: onCancelEdit,
              }),
              ...(!editing ? [{
                key: "delete",
                kind: "delete",
                label: "删除阶段",
                onClick: () => onDelete(phase.id),
                disabled,
              } as const] : []),
            ]}
          />
        ) : null;
      },
    },
  ];

  if (phases.length === 0) {
    return <EmptyStateCard compact>暂无项目阶段</EmptyStateCard>;
  }
  return (
    <TableScrollFrame className="overflow-y-hidden">
      <DataTable
        rows={phases}
        columns={columns}
        density="compact"
        emptyText="暂无项目阶段"
        rowKey={(phase) => phase.id}
        visibleColumns={["startDate", "endDate", "note"]}
        expandedRowKey={editingId}
        renderExpandedRow={(_phase) => (
          <PanelCard bodyClassName="p-3">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.4fr_minmax(0,2fr)]">
              <PhaseFields draft={editDraft} disabled={disabled} onChange={onEditDraftChange} />
            </div>
          </PanelCard>
        )}
      />
    </TableScrollFrame>
  );
}

function PhaseFields({
  draft,
  disabled,
  onChange,
}: {
  draft: PhaseDraft;
  disabled?: boolean;
  onChange: (draft: PhaseDraft) => void;
}) {
  return (
    <>
      <FormField label="阶段">
        <TextField value={draft.name} disabled={disabled} onChange={(value) => onChange({ ...draft, name: value })} placeholder="例如：方案确认" />
      </FormField>
      <FormField label="说明">
        <TextField value={draft.note} disabled={disabled} onChange={(value) => onChange({ ...draft, note: value })} />
      </FormField>
      <div className="grid grid-cols-1 gap-3 lg:col-span-2 sm:grid-cols-2">
        <FormField label="开始日期">
          <CalendarDateInput
            value={draft.startDate || null}
            disabled={disabled}
            onChange={(value) => onChange({ ...draft, startDate: value || "" })}
            popoverMode="fixed"
          />
        </FormField>
        <FormField label="结束日期">
          <CalendarDateInput
            value={draft.endDate || null}
            disabled={disabled}
            onChange={(value) => onChange({ ...draft, endDate: value || "" })}
            popoverMode="fixed"
          />
        </FormField>
      </div>
    </>
  );
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
