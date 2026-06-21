"use client";

import type { ReactNode } from "react";
import { ActionButton } from "./ActionControls";
import { joinClassNames } from "./card-utils";

export interface InlineCreatePanelProps {
  title: string;
  children: ReactNode;
  onSubmit: () => void;
  onCancel: () => void;
  submitDisabled?: boolean;
  submitting?: boolean;
  className?: string;
}

export default function InlineCreatePanel({
  title,
  children,
  onSubmit,
  onCancel,
  submitDisabled,
  submitting,
  className = "",
}: InlineCreatePanelProps) {
  return (
    <section className={joinClassNames("relative z-10 border-y border-slate-100 bg-white px-3 py-2", className)}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!submitDisabled && !submitting) onSubmit();
        }}
        className="flex min-h-10 flex-wrap items-center justify-start gap-2 leading-none [&_button]:!h-10 [&_button]:!text-xs [&_button]:!leading-none [&_input]:!h-10 [&_input]:!py-0 [&_input]:!text-xs [&_input]:!leading-none [&_label]:!h-10"
      >
        <h4 className="flex h-10 shrink-0 items-center border-l-4 border-emerald-500 pl-2 pr-1 text-xs font-semibold leading-none text-slate-900">{title}</h4>
        <div className="flex w-fit max-w-full shrink-0 flex-wrap items-center gap-1.5">{children}</div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <ActionButton
            type="submit"
            aria-label="创建"
            title="创建"
            disabled={submitDisabled || submitting}
            variant="primary"
            className="!w-10 !px-0 !text-lg"
          >
            ✓
          </ActionButton>
          <ActionButton
            aria-label="取消"
            title="取消"
            onClick={onCancel}
            className="!w-10 !px-0 !text-lg"
          >
            ×
          </ActionButton>
        </div>
      </form>
    </section>
  );
}
