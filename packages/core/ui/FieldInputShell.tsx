"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { getFieldInputClassName } from "./FormStyles";
import { joinClassNames } from "./card-utils";

export interface FieldInputShellProps extends Omit<HTMLAttributes<HTMLDivElement>, "className"> {
  children: ReactNode;
  className?: string;
}

export function FieldInputShell({ children, className = "", ...divProps }: FieldInputShellProps) {
  return (
    <div {...divProps} className={joinClassNames(getFieldInputClassName("flex overflow-hidden px-0 py-0"), className)}>
      {children}
    </div>
  );
}

export default FieldInputShell;
