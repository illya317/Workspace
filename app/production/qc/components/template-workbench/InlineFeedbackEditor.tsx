"use client";

import { selectionTitle, type WorkbenchSelection } from "./types";
import type { InlineAnchor } from "./inline-feedback-utils";

export default function InlineFeedbackEditor({
  anchor,
  selection,
  note,
  loading,
  saving,
  error,
  style,
  onNoteChange,
  onSave,
  onClose,
  onHoverChange,
}: {
  anchor: InlineAnchor;
  selection: WorkbenchSelection;
  note: string;
  loading: boolean;
  saving: boolean;
  error: string;
  style: { top: number; left: number };
  onNoteChange: (value: string) => void;
  onSave: () => void;
  onClose: () => void;
  onHoverChange: (hovered: boolean) => void;
}) {
  return (
    <div
      className="fixed z-50 w-80 rounded-lg border border-slate-200 bg-white p-4 shadow-xl"
      style={style}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900">字段反馈</div>
          <div className="mt-1 truncate text-xs text-slate-500">
            {anchor.section ? `${anchor.section} · ` : ""}{anchor.label}
          </div>
        </div>
        <button type="button" className="rounded-md bg-slate-100 px-2 py-1 text-slate-700 hover:bg-slate-200" onClick={onClose} aria-label="关闭字段反馈">
          ×
        </button>
      </div>
      <div className="mb-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-[12px] text-slate-600">
        {selectionTitle(selection)}
      </div>
      <textarea
        value={note}
        onChange={(event) => onNoteChange(event.target.value)}
        rows={5}
        placeholder="描述这个标题或字段的问题。"
        className="w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
        disabled={loading || saving}
      />
      {error ? <div className="mt-2 text-xs font-medium text-red-600">{error}</div> : null}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={onClose} disabled={saving}>
          取消
        </button>
        <button type="button" className="rounded-md bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50" onClick={onSave} disabled={saving || loading}>
          {saving ? "保存中" : "保存"}
        </button>
      </div>
    </div>
  );
}
