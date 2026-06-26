"use client";

import type { ReactNode } from "react";
import {
  fieldGridColumnsClass,
  getFieldGridCellClassName,
  getFieldGridHelperRowClassName,
  getFieldGridMainRowClassName,
  getFieldGridLabelClassName,
  getFieldGridValueClassName,
  getFieldGroupTitleClassName,
  getFieldHelperClassName,
} from "./FormStyles";
import { joinClassNames } from "./card-utils";

export type FieldGridMode = "view" | "edit" | "mixed" | "detail";

export interface FieldGridProps {
  children: ReactNode;
  columns?: 1 | 2 | 3;
  mode?: FieldGridMode;
  className?: string;
}

function FieldGridRoot({
  children,
  columns = 3,
  mode = "mixed",
  className = "",
}: FieldGridProps) {
  return (
    <div
      data-field-grid-mode={mode}
      className={joinClassNames("grid gap-2", fieldGridColumnsClass(columns), className)}
    >
      {children}
    </div>
  );
}

// mode 目前作为 data-field-grid-mode 标记保留，供未来视觉契约扩展；
// 当前 FieldGrid 是“无自身外框”的 label/value 布局网格，内部控件自己提供 surface。
//
// 视觉契约：
// - Cell 由固定高度的 main row（label + value）和可选的 helper row 组成。
// - helper row 不参与 main row 行高，因此即使某个 cell 带有长说明，也不会让同行其它 cell 的 label/value 基线错位。
// - 需要跨列的独立整行说明，使用 FieldGrid.Note，而不是把长文本塞进单个 cell 的 hint。

export interface FieldGridCellProps {
  label: ReactNode;
  children: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  span?: "wide" | "full" | number;
  mode?: FieldGridMode;
  className?: string;
  labelClassName?: string;
  valueClassName?: string;
}

export function FieldGridCell({
  label,
  children,
  required,
  hint,
  span,
  mode = "mixed",
  className = "",
  labelClassName = "",
  valueClassName = "",
}: FieldGridCellProps) {
  const spanClass = span === "wide" || span === "full"
    ? "col-span-full"
    : typeof span === "number"
      ? `col-span-${span}`
      : "";
  return (
    <div className={getFieldGridCellClassName(joinClassNames(spanClass, className))}>
      <div className={getFieldGridMainRowClassName("", mode)}>
        <div className={getFieldGridLabelClassName(labelClassName)}>
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </div>
        <div className={getFieldGridValueClassName(valueClassName, mode)}>
          {children}
        </div>
      </div>
      {hint && (
        <div className={getFieldGridHelperRowClassName("", mode)}>
          <div />
          <div className={getFieldHelperClassName()}>{hint}</div>
        </div>
      )}
    </div>
  );
}

export interface FieldGridNoteProps {
  children: ReactNode;
  className?: string;
}

export function FieldGridNote({ children, className = "" }: FieldGridNoteProps) {
  return (
    <div className={joinClassNames("col-span-full px-3 py-1.5", getFieldHelperClassName(), className)}>
      {children}
    </div>
  );
}

export interface FieldGroupTitleProps {
  children: ReactNode;
  className?: string;
}

export function FieldGroupTitle({ children, className = "" }: FieldGroupTitleProps) {
  return <div className={getFieldGroupTitleClassName(className)}>{children}</div>;
}

export const FieldGrid = Object.assign(FieldGridRoot, {
  Cell: FieldGridCell,
  Note: FieldGridNote,
  GroupTitle: FieldGroupTitle,
});

export default FieldGrid;
