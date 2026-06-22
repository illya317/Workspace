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
  htmlFor?: string;
}

export default function FormField({
  label,
  children,
  required = false,
  hint,
  error,
  className = "",
  layout = "stacked",
  htmlFor,
}: FormFieldProps) {
  const inline = layout === "inline";
  const labelNode = htmlFor ? (
    <label htmlFor={htmlFor}>
      {label}
      {required && <span className="ml-0.5 text-red-500">*</span>}
    </label>
  ) : (
    <>
      {label}
      {required && <span className="ml-0.5 text-red-500">*</span>}
    </>
  );

  if (inline) {
    return (
      <div className={joinClassNames("inline-flex h-10 min-w-0 items-center gap-1.5 text-xs leading-none", className)}>
        <span data-field-label="true" className="inline-flex h-10 shrink-0 items-center whitespace-nowrap text-xs font-semibold leading-none text-slate-500">
          {labelNode}
        </span>
        <span data-field-control="true" className="inline-flex h-10 min-w-0 items-center text-xs leading-none [&_button]:text-xs [&_input]:font-sans [&_input]:text-xs [&_input]:leading-none [&_input]:tabular-nums">
          {children}
        </span>
        {hint && !error && <span className="text-xs text-slate-400">{hint}</span>}
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    );
  }

  return (
    <div className={joinClassNames("block min-w-0", className)}>
      <span className="mb-0.5 block text-xs font-semibold text-slate-500">
        {labelNode}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-500">{error}</span>}
    </div>
  );
}
