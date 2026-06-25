"use client";

import type { ReactNode } from "react";
import { joinClassNames } from "./card-utils";

export interface ToolbarOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

export interface ToolbarOptionGroupProps {
  value: string;
  options: ToolbarOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
}

export default function ToolbarOptionGroup({
  value,
  options,
  onChange,
  ariaLabel,
  className = "",
}: ToolbarOptionGroupProps) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={joinClassNames("inline-flex min-h-10 flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 align-middle", className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={joinClassNames(
              "grid h-8 place-items-center rounded-md px-3 text-xs font-semibold leading-none transition disabled:cursor-not-allowed disabled:text-slate-300",
              active
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-white hover:text-slate-900",
            )}
          >
            <span className="-translate-y-px">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
