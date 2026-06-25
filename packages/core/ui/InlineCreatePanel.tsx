"use client";

import { Children, Fragment, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { CreateConfirmActions } from "./CreateActionControls";
import FormField from "./FormField";
import { joinClassNames } from "./card-utils";

export interface InlineCreatePanelProps {
  title: string;
  children: ReactNode;
  onSubmit: () => void;
  onCancel: () => void;
  submitDisabled?: boolean;
  submitting?: boolean;
  submitLabel?: string;
  cancelLabel?: string;
  hideTitle?: boolean;
  className?: string;
}

function forceInlineFields(node: ReactNode): ReactNode {
  if (!isValidElement(node)) return node;
  if (node.type === FormField) {
    return cloneElement(node as ReactElement<{ layout?: "stacked" | "inline" }>, { layout: "inline" });
  }
  if (node.type === Fragment) {
    const fragmentNode = node as ReactElement<{ children?: ReactNode }>;
    return cloneElement(fragmentNode, {
      children: Children.map(fragmentNode.props.children, forceInlineFields),
    });
  }
  return node;
}

export default function InlineCreatePanel({
  title,
  children,
  onSubmit,
  onCancel,
  submitDisabled,
  submitting,
  submitLabel,
  cancelLabel,
  hideTitle = false,
  className = "",
}: InlineCreatePanelProps) {
  const inlineChildren = Children.map(children, forceInlineFields);
  return (
    <section className={joinClassNames("relative z-10 border-y border-slate-100 bg-white px-0 py-2", className)}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!submitDisabled && !submitting) onSubmit();
        }}
        className="flex min-h-10 flex-wrap items-start justify-start gap-x-3 gap-y-2 leading-none [&_button]:!h-9 [&_button]:!text-[11px] [&_button]:!leading-none [&_input]:!h-9 [&_input]:!py-0 [&_input]:!text-[11px] [&_input]:!leading-none [&_label]:!h-9"
      >
        {!hideTitle && <h4 className="flex h-9 shrink-0 items-center pr-2 text-xs font-semibold leading-none text-slate-900">{title}</h4>}
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-x-3 gap-y-2 [&_[data-field-control]]:!h-9 [&_[data-field-control]]:min-w-28 [&_[data-field-control]>*]:w-full [&_[data-field-label]]:!h-9 [&_[data-field-label]]:text-xs">
          {inlineChildren}
        </div>
        <CreateConfirmActions
          onSubmit={onSubmit}
          onCancel={onCancel}
          submitDisabled={submitDisabled}
          submitting={submitting}
          submitLabel={submitLabel}
          cancelLabel={cancelLabel}
        />
      </form>
    </section>
  );
}
