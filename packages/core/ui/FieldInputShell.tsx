"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { getFieldInputClassName } from "./FormStyles";
import { joinClassNames } from "./card-utils";

export interface FieldInputShellProps extends Omit<HTMLAttributes<HTMLDivElement>, "className" | "prefix" | "suffix"> {
  children: ReactNode;
  prefix?: ReactNode;
  suffix?: ReactNode;
  disabled?: boolean;
  className?: string;
}

function affixClassName(disabled?: boolean) {
  return [
    "flex shrink-0 items-center justify-center self-stretch px-3 text-sm font-semibold",
    disabled ? "bg-slate-100 text-slate-400" : "bg-slate-50 text-slate-500",
  ].join(" ");
}

export function FieldInputShell({
  children,
  prefix,
  suffix,
  disabled,
  className = "",
  ...divProps
}: FieldInputShellProps) {
  return (
    <div
      {...divProps}
      aria-disabled={disabled}
      className={joinClassNames(
        getFieldInputClassName("flex items-center overflow-hidden px-0 py-0"),
        disabled && "bg-slate-100",
        className,
      )}
    >
      {prefix && (
        <span className={`${affixClassName(disabled)} border-r border-slate-200`}>{prefix}</span>
      )}
      {children}
      {suffix && (
        <span className={`${affixClassName(disabled)} border-l border-slate-200`}>{suffix}</span>
      )}
    </div>
  );
}

export default FieldInputShell;
