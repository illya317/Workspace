"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { getFieldShellClassName } from "../form/FormStyles";
import type { FieldControlSize } from "../form/FormStyles";
import { joinClassNames } from "../common/card-utils";

export interface FieldShellProps extends Omit<HTMLAttributes<HTMLDivElement>, "className" | "prefix" | "suffix"> {
  children: ReactNode;
  prefix?: ReactNode;
  suffix?: ReactNode;
  disabled?: boolean;
  readOnly?: boolean;
  size?: FieldControlSize;
  density?: "normal" | "compact";
  layout?: "default" | "tags";
  className?: string;
}

function affixClassName(disabled?: boolean) {
  return [
    "flex shrink-0 items-center justify-center self-stretch px-3 text-sm font-semibold",
    disabled ? "bg-slate-100 text-slate-400" : "bg-slate-50 text-slate-500",
  ].join(" ");
}

/**
 * 统一字段壳。
 *
 * 所有进入表单的输入控件（text、readonly、fk、select、tags）都应套在此壳内，
 * 以保证统一的高度、边框、圆角、阴影、focus 环、padding、字号、行高和垂直居中。
 */
export function FieldShell({
  children,
  prefix,
  suffix,
  disabled,
  readOnly,
  size = "md",
  density = "normal",
  layout = "default",
  className = "",
  ...divProps
}: FieldShellProps) {
  return (
    <div
      {...divProps}
      aria-disabled={disabled}
      className={joinClassNames(
        getFieldShellClassName({
          size,
          density,
          layout,
          hasAffix: Boolean(prefix || suffix),
          disabled,
          readOnly,
        }),
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

export default FieldShell;
