"use client";

import { CommandButton, PanelCard, TextareaField } from "@workspace/core/ui";
import { selectionTitle, type WorkbenchSelection } from "./types";
import type { InlineAnchor, InlineEntry } from "./inline-feedback-utils";
export default function InlineFeedbackEditor({
  anchor,
  selection,
  entries,
  note,
  loading,
  saving,
  error,
  style,
  onNoteChange,
  onSave,
  onClose,
  onHoverChange
}: {
  anchor: InlineAnchor;
  selection: WorkbenchSelection;
  entries: InlineEntry[];
  note: string;
  loading: boolean;
  saving: boolean;
  error: string;
  style: {
    top: number;
    left: number;
  };
  onNoteChange: (value: string) => void;
  onSave: () => void;
  onClose: () => void;
  onHoverChange: (hovered: boolean) => void;
}) {
  return <PanelCard className="fixed z-50 w-80 shadow-xl" bodyClassName="p-4" style={style} onMouseEnter={() => onHoverChange(true)} onMouseLeave={() => onHoverChange(false)}>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">字段反馈</div>
          <div className="mt-1 truncate text-xs text-slate-500">
            {anchor.section ? `${anchor.section} · ` : ""}{anchor.label}
          </div>
        </div>
        <CommandButton onClick={onClose} aria-label="关闭字段反馈" className="px-2 py-1">
          ×
        </CommandButton>
      </div>
      <PanelCard bodyClassName="px-2 py-2 text-[12px] text-slate-600" className="mb-2">
        {selectionTitle(selection)}
      </PanelCard>
      {entries.length > 0 ? <div className="mb-2 max-h-32 space-y-2 overflow-y-auto rounded-md border border-amber-200 bg-amber-50 px-2 py-2">
          {entries.map((entry, index) => <div key={`${entry.id}-${index}`} className="text-xs leading-5 text-slate-700">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <span className="font-semibold text-amber-800">{entry.userName || "未知"}</span>
                {entry.resolved ? <span className="text-[11px] text-emerald-700">已解决</span> : null}
              </div>
              <div className="whitespace-pre-wrap">{entry.note}</div>
            </div>)}
        </div> : null}
      <div className="mb-1 text-xs font-semibold text-slate-500">我的反馈</div>
      <TextareaField value={note} onChange={onNoteChange} rows={5} placeholder="描述这个标题或字段的问题。" unstyled resize="vertical" disabled={loading || saving} />
      {error ? <div className="mt-2 text-xs font-medium text-red-600">{error}</div> : null}
      <div className="mt-3 flex justify-end gap-2">
        <CommandButton onClick={onClose} disabled={saving} className="px-3 py-2 text-xs">
          取消
        </CommandButton>
        <CommandButton variant="primary" onClick={onSave} disabled={saving || loading} className="px-3 py-2 text-xs">
          {saving ? "保存中" : "保存"}
        </CommandButton>
      </div>
    </PanelCard>;
}
