"use client";

import type { ReactNode } from "react";
import { joinClassNames } from "./card-utils";

export interface FormFieldProps {
  label: ReactNode;
  children: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  layout?: "stacked" | "inline";
}

export default function FormField({
  label,
  children,
  required = false,
  hint,
  error,
  className = "",
  layout = "stacked",
}: FormFieldProps) {
  const inline = layout === "inline";

  if (inline) {
    return (
      <label className={joinClassNames("grid min-w-0 grid-cols-[4rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1 text-sm", className)}>
        <span className="shrink-0 whitespace-nowrap text-sm font-semibold text-slate-500">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </span>
        <span className="min-w-0 text-sm [&_button]:text-sm [&_input]:font-sans [&_input]:text-sm [&_input]:tabular-nums">
          {children}
        </span>
        {hint && !error && <span className="col-start-2 text-xs text-slate-400">{hint}</span>}
        {error && <span className="col-start-2 text-xs text-red-500">{error}</span>}
      </label>
    );
  }

  return (
    <label className={joinClassNames("block min-w-0", className)}>
      <span className="mb-1 block text-sm font-medium text-slate-500">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-500">{error}</span>}
    </label>
  );
}
