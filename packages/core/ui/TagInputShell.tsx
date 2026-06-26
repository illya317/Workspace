"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { getTagInputShellClassName } from "./FormStyles";
import { joinClassNames } from "./card-utils";

export interface TagInputShellProps extends Omit<HTMLAttributes<HTMLDivElement>, "className"> {
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function TagInputShell({
  children,
  disabled,
  className = "",
  ...divProps
}: TagInputShellProps) {
  return (
    <div
      {...divProps}
      className={joinClassNames(
        getTagInputShellClassName(),
        disabled && "bg-slate-100",
        className,
      )}
    >
      {children}
    </div>
  );
}

export default TagInputShell;
