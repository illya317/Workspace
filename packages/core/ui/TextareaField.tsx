"use client";

import type { KeyboardEventHandler } from "react";

export interface TextareaFieldProps {
  value?: string;
  onChange: (value: string) => void;
  rows?: number;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>;
}

export default function TextareaField({
  value = "",
  onChange,
  rows = 3,
  className = "",
  placeholder,
  disabled = false,
  ariaLabel,
  onKeyDown,
}: TextareaFieldProps) {
  return (
    <textarea
      value={value}
      rows={rows}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      onChange={(event) => onChange(event.target.value)}
      className={`w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-emerald-400 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500 ${className}`}
    />
  );
}
