"use client";

import type { ReactNode } from "react";
import CheckboxField from "./CheckboxField";
import { joinClassNames } from "./card-utils";

export interface CheckboxChipProps {
  checked: boolean;
  children: ReactNode;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}

export default function CheckboxChip({
  checked,
  children,
  onChange,
  disabled = false,
  ariaLabel,
  className = "",
}: CheckboxChipProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={joinClassNames(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition disabled:cursor-not-allowed disabled:opacity-60",
        checked
          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300",
        className,
      )}
    >
      <CheckboxField
        checked={checked}
        disabled={disabled}
        ariaLabel={ariaLabel}
        onChange={onChange}
        className="pointer-events-none size-3 accent-emerald-600"
      />
      <span>{children}</span>
    </button>
  );
}
