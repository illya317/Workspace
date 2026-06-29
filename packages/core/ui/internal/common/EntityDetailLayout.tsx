"use client";

import type { ReactNode } from "react";
import FieldControl, { type FieldControlProps } from "../input/FieldControl";
import FieldGrid from "../input/FieldGrid";
import { joinClassNames } from "./card-utils";

export interface EntityDetailLayoutProps {
  children: ReactNode;
  className?: string;
}

export interface EntityDetailFieldsProps {
  children: ReactNode;
  columns?: 1 | 2 | 3;
  className?: string;
}

export interface EntityDetailMetricsProps {
  children: ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
}

export interface EntityDetailFieldProps extends FieldControlProps {
  label: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  span?: "full";
}

function EntityDetailLayoutRoot({ children, className }: EntityDetailLayoutProps) {
  return <div className={joinClassNames("space-y-3", className)}>{children}</div>;
}

function EntityDetailFields({ children, columns = 2, className }: EntityDetailFieldsProps) {
  return (
    <FieldGrid columns={columns} mode="detail" className={className}>
      {children}
    </FieldGrid>
  );
}

function EntityDetailMetrics({ children, columns = 4, className }: EntityDetailMetricsProps) {
  const gridClass =
    columns === 2
      ? "grid-cols-2"
      : columns === 3
        ? "grid-cols-3"
        : "grid-cols-2 md:grid-cols-4";
  return <div className={joinClassNames("grid gap-2", gridClass, className)}>{children}</div>;
}

function EntityDetailField({
  label,
  hint,
  required,
  span,
  ...controlProps
}: EntityDetailFieldProps) {
  return (
    <FieldGrid.Cell
      label={label}
      hint={hint}
      required={required}
      span={span === "full" ? "full" : undefined}
      mode="detail"
    >
      <FieldControl {...controlProps} />
    </FieldGrid.Cell>
  );
}

export const EntityDetailLayout = Object.assign(EntityDetailLayoutRoot, {
  Fields: EntityDetailFields,
  Metrics: EntityDetailMetrics,
  Field: EntityDetailField,
});

export default EntityDetailLayout;
