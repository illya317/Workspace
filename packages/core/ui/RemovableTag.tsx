"use client";

import type { MouseEvent, ReactNode } from "react";
import { joinClassNames } from "./card-utils";
import type { ConfirmOptions } from "./ConfirmProvider";
import TagPill from "./TagPill";
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
  /** 覆盖默认的 8 字符截断，<=0 表示不截断。 */
  maxLength?: number;
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
  maxLength,
}: RemovableTagProps) {
  function stopTagEvent(event: MouseEvent<HTMLSpanElement>) {
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <span className="inline-flex" onMouseDown={stopTagEvent} onClick={stopTagEvent}>
      <TagPill
        title={title}
        className={joinClassNames("px-3 text-slate-700", className)}
        textClassName={textClassName}
        disabled={disabled}
        maxLength={maxLength}
        action={
          !disabled && (
            <TagRemoveButton
              label={label}
              confirm={confirm}
              confirmMessage={confirmMessage}
              confirmOptions={confirmOptions}
              onConfirm={onRemove}
              className="pointer-events-auto ml-0.5 shrink-0 border border-sky-200 bg-sky-50 text-sky-700 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
            />
          )
        }
      >
        {children}
      </TagPill>
    </span>
  );
}
