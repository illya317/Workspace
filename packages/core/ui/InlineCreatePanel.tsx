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
  hideTitle?: boolean;
  className?: string;
}

export default function InlineCreatePanel({
  title,
  children,
  onSubmit,
  onCancel,
  submitDisabled,
  submitting,
  hideTitle = false,
  className = "",
}: InlineCreatePanelProps) {
  return (
    <section className={joinClassNames("relative z-10 border-y border-slate-100 bg-white px-0 py-2", className)}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!submitDisabled && !submitting) onSubmit();
        }}
        className="flex min-h-10 flex-wrap items-center justify-start gap-x-3 gap-y-2 leading-none [&_button]:!h-9 [&_button]:!text-[11px] [&_button]:!leading-none [&_input]:!h-9 [&_input]:!py-0 [&_input]:!text-[11px] [&_input]:!leading-none [&_label]:!h-9"
      >
        {!hideTitle && <h4 className="flex h-9 shrink-0 items-center pr-2 text-xs font-semibold leading-none text-slate-900">{title}</h4>}
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-x-3 gap-y-2 [&_[data-field-control]]:w-28 [&_[data-field-control]>*]:w-full [&_[data-field-label]]:text-xs [&>label]:!w-auto [&>label]:!max-w-none [&>label]:gap-2">
          {children}
        </div>
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
