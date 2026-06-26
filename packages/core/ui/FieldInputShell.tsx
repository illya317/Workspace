"use client";

import type { HTMLAttributes, ReactNode } from "react";
import FieldShell, { type FieldShellProps } from "./FieldShell";
import type { FieldControlSize } from "./FormStyles";

export interface FieldInputShellProps extends Omit<HTMLAttributes<HTMLDivElement>, "className" | "prefix" | "suffix"> {
  children: ReactNode;
  prefix?: ReactNode;
  suffix?: ReactNode;
  disabled?: boolean;
  readOnly?: boolean;
  size?: FieldControlSize;
  density?: FieldShellProps["density"];
  className?: string;
}

/**
 * 单行输入字段壳。
 *
 * 是 FieldShell 的默认布局（layout="default"）别名，保留 prefix/suffix 能力。
 * 新代码可优先使用 FieldShell；此组件继续存在以保持向后兼容。
 */
export function FieldInputShell({
  children,
  prefix,
  suffix,
  disabled,
  readOnly,
  size = "md",
  density = "normal",
  className = "",
  ...divProps
}: FieldInputShellProps) {
  return (
    <FieldShell
      {...divProps}
      prefix={prefix}
      suffix={suffix}
      disabled={disabled}
      readOnly={readOnly}
      size={size}
      density={density}
      layout="default"
      className={className}
    >
      {children}
    </FieldShell>
  );
}

export default FieldInputShell;
