"use client";

import { useState } from "react";
import { ActionButton, BlockCreatePanel, CalendarDateInput, useConfirm, useConfirmDelete } from "@workspace/core/ui";
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
      await confirm({ title: "新建计划阶段失败", message: err instanceof Error ? err.message : "新建计划阶段失败", confirmLabel: "关闭", confirmDanger: true, showCancel: false });
    } finally {
      setBusy(false);
    }
  }

  function startEdit(phase: ProjectPlanPhaseItem) {
    setEditingId(phase.id);
    setEditDraft({
      name: phase.name,
      startDate: phase.startDate ?? "",
      endDate: phase.endDate ?? "",
      note: phase.note ?? "",
    });
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
      await confirm({ title: "保存计划阶段失败", message: err instanceof Error ? err.message : "保存计划阶段失败", confirmLabel: "关闭", confirmDanger: true, showCancel: false });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(phaseId: number) {
    const confirmed = await confirmDelete({ message: "删除计划阶段后，已归属到该阶段的任务会回到未分阶段。确定删除吗？" });
    if (!confirmed) return;
    setBusy(true);
    try {
      await deleteProjectPlanPhase(projectId, phaseId);
      await onChanged();
    } catch (err) {
      await confirm({ title: "删除计划阶段失败", message: err instanceof Error ? err.message : "删除计划阶段失败", confirmLabel: "关闭", confirmDanger: true, showCancel: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <BlockCreatePanel
      title="计划阶段"
      creating={creating}
      canCreate={canEdit}
      disabled={disabled || busy}
      submitting={busy}
      submitDisabled={!draft.name.trim()}
      addLabel="新增计划阶段"
      submitLabel="保存计划阶段"
      onStartCreate={() => setCreating(true)}
      onCancelCreate={() => {
        setCreating(false);
        setDraft(EMPTY_DRAFT);
      }}
      onSubmitCreate={submitCreate}
      createContent={(
        <div className="grid grid-cols-[1.4fr_140px_140px_minmax(0,2fr)] items-end gap-3">
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
  if (phases.length === 0) {
    return <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-sm font-semibold text-slate-400">暂无计划阶段</div>;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <div className="grid grid-cols-[80px_1.2fr_1fr_minmax(0,2fr)_140px] bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
        <span>序号</span>
        <span>阶段</span>
        <span>时间</span>
        <span>说明</span>
        <span className="text-right">操作</span>
      </div>
      {phases.map((phase) => editingId === phase.id ? (
        <div key={phase.id} className="border-t border-slate-100 p-3">
          <div className="grid grid-cols-[1.4fr_140px_140px_minmax(0,2fr)_auto] items-end gap-3">
            <PhaseFields draft={editDraft} disabled={disabled} onChange={onEditDraftChange} />
            <div className="flex justify-end gap-2">
              <ActionButton disabled={disabled} onClick={onCancelEdit}>取消</ActionButton>
              <ActionButton variant="primary" disabled={disabled || !editDraft.name.trim()} onClick={() => onSubmitEdit(phase.id)}>保存</ActionButton>
            </div>
          </div>
        </div>
      ) : (
        <div key={phase.id} className="grid grid-cols-[80px_1.2fr_1fr_minmax(0,2fr)_140px] items-center border-t border-slate-100 px-3 py-3 text-sm text-slate-700">
          <span className="font-semibold text-slate-400">{phase.sequenceNo}</span>
          <span className="font-semibold text-slate-900">{phase.name}</span>
          <span className="text-slate-500">{formatRange(phase.startDate, phase.endDate)}</span>
          <span className="truncate text-slate-600">{phase.note || "-"}</span>
          {canEdit ? (
            <span className="flex justify-end gap-2">
              <ActionButton className="!h-9 !px-3" disabled={disabled} onClick={() => onStartEdit(phase)}>编辑</ActionButton>
              <ActionButton className="!h-9 !px-3" variant="danger" disabled={disabled} onClick={() => onDelete(phase.id)}>删除</ActionButton>
            </span>
          ) : <span />}
        </div>
      ))}
    </div>
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
      <label className="space-y-1">
        <span className="text-xs font-semibold text-slate-500">阶段</span>
        <input value={draft.name} disabled={disabled} onChange={(event) => onChange({ ...draft, name: event.target.value })} className={inputClassName} placeholder="例如：方案确认" />
      </label>
      <label className="space-y-1">
        <span className="text-xs font-semibold text-slate-500">开始</span>
        <CalendarDateInput
          value={draft.startDate || null}
          disabled={disabled}
          onChange={(value) => onChange({ ...draft, startDate: value || "" })}
          className={inputClassName}
          popoverMode="fixed"
        />
      </label>
      <label className="space-y-1">
        <span className="text-xs font-semibold text-slate-500">结束</span>
        <CalendarDateInput
          value={draft.endDate || null}
          disabled={disabled}
          onChange={(value) => onChange({ ...draft, endDate: value || "" })}
          className={inputClassName}
          popoverMode="fixed"
        />
      </label>
      <label className="space-y-1">
        <span className="text-xs font-semibold text-slate-500">说明</span>
        <input value={draft.note} disabled={disabled} onChange={(event) => onChange({ ...draft, note: event.target.value })} className={inputClassName} />
      </label>
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

function formatRange(start?: string | null, end?: string | null) {
  if (start && end) return `${start} - ${end}`;
  if (start) return `${start} 起`;
  if (end) return `截至 ${end}`;
  return "未设置";
}

const inputClassName = "h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-800 shadow-sm disabled:bg-slate-50 disabled:text-slate-400";
