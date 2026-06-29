"use client";

import { FixedPositionBox } from "../../../rendering/FixedPositionBox";
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
  position,
  onNoteChange,
  onSave,
  onClose,
  onHoverChange,
}: {
  anchor: InlineAnchor;
  selection: WorkbenchSelection;
  entries: InlineEntry[];
  note: string;
  loading: boolean;
  saving: boolean;
  error: string;
  position: {
    top: number;
    left: number;
  };
  onNoteChange: (value: string) => void;
  onSave: () => void;
  onClose: () => void;
  onHoverChange: (hovered: boolean) => void;
}) {
  const disabled = loading || saving;

  return (
    <FixedPositionBox
      className="fixed z-50 w-96"
      top={position.top}
      left={position.left}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
    >
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl shadow-slate-900/15">
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-950">字段反馈</div>
              <div className="mt-1 truncate text-xs font-medium text-slate-500">
                {anchor.section ? `${anchor.section} · ` : ""}{anchor.label}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-200"
              aria-label="关闭"
              title="关闭"
            >
              <CloseIcon />
            </button>
          </div>
          <div className="mt-3 truncate text-xs text-slate-400">{selectionTitle(selection)}</div>
        </div>

        <div className="space-y-3 px-4 py-4">
          {entries.length > 0 ? (
            <div className="max-h-28 space-y-2 overflow-y-auto rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
              {entries.map((entry, index) => (
                <div key={`${entry.id}-${index}`} className="text-xs leading-5 text-slate-700">
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-semibold text-amber-800">{entry.userName || "未知"}</span>
                    {entry.resolved ? <span className="shrink-0 text-[11px] text-emerald-700">已解决</span> : null}
                  </div>
                  <div className="whitespace-pre-wrap break-words">{entry.note}</div>
                </div>
              ))}
            </div>
          ) : null}

          <textarea
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            disabled={disabled}
            rows={6}
            placeholder="描述这个标题或字段的问题。"
            className="block min-h-36 w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 disabled:bg-slate-100 disabled:text-slate-500"
          />

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">{error}</div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-300"
            aria-label="取消"
            title="取消"
          >
            <CancelIcon />
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={disabled}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-emerald-600 text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-300"
            aria-label={saving ? "保存中" : "保存"}
            title={saving ? "保存中" : "保存"}
          >
            <SaveIcon />
          </button>
        </div>
      </section>
    </FixedPositionBox>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function CancelIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 4h12l2 2v14H5z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 4v6h8V4M8 20v-6h8v6" />
    </svg>
  );
}
