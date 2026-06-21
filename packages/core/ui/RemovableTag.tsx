"use client";

import type { MouseEvent, ReactNode } from "react";
import { joinClassNames } from "./card-utils";
import { getTagPillClassName } from "./FormStyles";
import type { ConfirmOptions } from "./ConfirmProvider";
import TagRemoveButton from "./TagRemoveButton";

export interface RemovableTagProps {
  children: ReactNode;
  label: string;
  onRemove?: () => void | Promise<void>;
  disabled?: boolean;
  confirm?: boolean;
  confirmMessage?: ConfirmOptions["message"];
  confirmOptions?: Partial<ConfirmOptions>;
  title?: string;
  className?: string;
  textClassName?: string;
}

export default function RemovableTag({
  children,
  label,
  onRemove,
  disabled = false,
  confirm = true,
  confirmMessage,
  confirmOptions,
  title,
  className = "",
  textClassName = "truncate",
}: RemovableTagProps) {
  const tagClassName = joinClassNames(
    getTagPillClassName("px-3 text-sm text-slate-700"),
    className,
  );
  const contentClassName = joinClassNames("pointer-events-none", textClassName);

  function stopTagEvent(event: MouseEvent<HTMLSpanElement>) {
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <span
      title={title}
      className={tagClassName}
      onMouseDown={stopTagEvent}
      onClick={stopTagEvent}
    >
      <span className={contentClassName}>{children}</span>
      {!disabled && (
        <TagRemoveButton
          label={label}
          confirm={confirm}
          confirmMessage={confirmMessage}
          confirmOptions={confirmOptions}
          onConfirm={onRemove}
          className="pointer-events-auto ml-0.5 shrink-0 border border-sky-200 bg-sky-50 text-sky-700 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
        />
      )}
    </span>
  );
}
