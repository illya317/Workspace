"use client";

import type { HTMLAttributes, ReactNode } from "react";
import FieldShell, { type FieldShellProps } from "./FieldShell";
import type { FieldControlSize } from "../form/FormStyles";

export interface TagInputShellProps extends Omit<HTMLAttributes<HTMLDivElement>, "className"> {
  children: ReactNode;
  disabled?: boolean;
  size?: FieldControlSize;
  density?: FieldShellProps["density"];
  className?: string;
}

/**
 * Tag 输入字段壳。
 *
 * 基于 FieldShell 的 tags 布局，允许 pill 换行，同时保持和单行字段壳一致的
 * 边框、圆角、阴影、焦点环和垂直居中。
 */
export function TagInputShell({
  children,
  disabled,
  size = "md",
  density = "normal",
  className = "",
  ...divProps
}: TagInputShellProps) {
  return (
    <FieldShell
      {...divProps}
      disabled={disabled}
      size={size}
      density={density}
      layout="tags"
      className={className}
    >
      {children}
    </FieldShell>
  );
}

export default TagInputShell;
