"use client";

import type { FormEvent, ReactNode } from "react";
import { joinClassNames } from "../common/card-utils";

export interface FormShellProps {
  children: ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  className?: string;
}

export default function FormShell({
  children,
  onSubmit,
  className = "",
}: FormShellProps) {
  return (
    <form onSubmit={onSubmit} className={joinClassNames("space-y-4", className)}>
      {children}
    </form>
  );
}
