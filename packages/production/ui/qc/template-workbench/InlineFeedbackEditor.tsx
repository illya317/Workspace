"use client";

import { FormSurface } from "@workspace/core/ui";
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
  return (
    <div className="fixed z-50 w-80" style={style} onMouseEnter={() => onHoverChange(true)} onMouseLeave={() => onHoverChange(false)}>
      <FormSurface
        kind="fields"
        className="rounded-lg border border-slate-200 bg-white p-4 shadow-xl"
        fields={[
          {
            kind: "note",
            key: "header",
            content: (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900">字段反馈</div>
                  <div className="mt-1 truncate text-xs text-slate-500">
                    {anchor.section ? `${anchor.section} · ` : ""}{anchor.label}
                  </div>
                </div>
                <FormSurface
                  kind="inline"
                  actions={[{
                    key: "close",
                    label: "×",
                    onClick: onClose,
                    className: "px-2 py-1",
                  }]}
                />
              </div>
            ),
          },
          {
            kind: "note",
            key: "selection",
            className: "rounded-md border border-slate-100 bg-slate-50 px-2 py-2 text-[12px] text-slate-600",
            content: selectionTitle(selection),
          },
          ...(entries.length > 0 ? [{
            kind: "note" as const,
            key: "entries",
            content: (
              <div className="max-h-32 space-y-2 overflow-y-auto rounded-md border border-amber-200 bg-amber-50 px-2 py-2">
                {entries.map((entry, index) => <div key={`${entry.id}-${index}`} className="text-xs leading-5 text-slate-700">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                    <span className="font-semibold text-amber-800">{entry.userName || "未知"}</span>
                    {entry.resolved ? <span className="text-[11px] text-emerald-700">已解决</span> : null}
                  </div>
                  <div className="whitespace-pre-wrap">{entry.note}</div>
                </div>)}
              </div>
            ),
          }] : []),
          {
            key: "note",
            label: "我的反馈",
            spec: { valueType: "string", editor: "textarea", state: loading || saving ? "disabled" : "normal" },
            value: note,
            onChange: (value) => onNoteChange(String(value ?? "")),
            rows: 5,
            placeholder: "描述这个标题或字段的问题。",
          },
          ...(error ? [{
            kind: "note" as const,
            key: "error",
            className: "text-xs font-medium text-red-600",
            content: error,
          }] : []),
        ]}
        actions={[
          {
            key: "cancel",
            label: "取消",
            onClick: onClose,
            disabled: saving,
            className: "px-3 py-2 text-xs",
          },
          {
            key: "save",
            label: saving ? "保存中" : "保存",
            variant: "primary",
            onClick: onSave,
            disabled: saving || loading,
            className: "px-3 py-2 text-xs",
          },
        ]}
      />
    </div>
  );
}
