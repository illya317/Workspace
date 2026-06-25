"use client";

import type { ReactNode } from "react";
import {
  getFieldGridCellClassName,
  getFieldGridLabelClassName,
  getFieldGridValueClassName,
  getFieldGroupTitleClassName,
} from "./FormStyles";
import { joinClassNames } from "./card-utils";

export interface FieldGridProps {
  children: ReactNode;
  className?: string;
}

function FieldGridRoot({ children, className = "grid-cols-3" }: FieldGridProps) {
  return (
    <div className={joinClassNames("grid gap-2", className)}>
      {children}
    </div>
  );
}

export interface FieldGridCellProps {
  label: ReactNode;
  children: ReactNode;
  required?: boolean;
  className?: string;
  labelClassName?: string;
  valueClassName?: string;
}

export function FieldGridCell({
  label,
  children,
  required,
  className = "",
  labelClassName = "",
  valueClassName = "",
}: FieldGridCellProps) {
  return (
    <div className={getFieldGridCellClassName(className)}>
      <div className={getFieldGridLabelClassName(labelClassName)}>
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </div>
      <div className={getFieldGridValueClassName(valueClassName)}>
        {children}
      </div>
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
  GroupTitle: FieldGroupTitle,
});

export default FieldGrid;
