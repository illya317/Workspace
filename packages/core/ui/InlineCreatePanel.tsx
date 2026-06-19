"use client";

import type { ReactNode } from "react";

export interface InlineCreatePanelProps {
  title: string;
  children: ReactNode;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel?: string;
  submitDisabled?: boolean;
  submitting?: boolean;
  className?: string;
  fieldsClassName?: string;
}

export default function InlineCreatePanel({
  title,
  children,
  onSubmit,
  onCancel,
  submitLabel = "新建",
  submitDisabled,
  submitting,
  className = "",
  fieldsClassName = "grid grid-cols-1 gap-3 lg:grid-cols-[minmax(260px,1.3fr)_minmax(260px,1.7fr)_180px_auto] lg:items-end",
}: InlineCreatePanelProps) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      <h4 className="border-b border-slate-200 pb-3 text-base font-semibold text-slate-900">{title}</h4>
      <div className={`${fieldsClassName} pt-4`}>
        {children}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={submitDisabled || submitting}
            onClick={onSubmit}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {submitting ? "新建中..." : submitLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            取消
          </button>
        </div>
      </div>
    </section>
  );
}
