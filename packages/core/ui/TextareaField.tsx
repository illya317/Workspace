"use client";

import type { CSSProperties, KeyboardEventHandler } from "react";

export interface TextareaFieldProps {
  value?: string;
  onChange?: (value: string) => void;
  rows?: number;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  ariaLabel?: string;
  dataFieldKey?: string;
  style?: CSSProperties;
  title?: string;
  onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>;
  unstyled?: boolean;
}

export default function TextareaField({
  value = "",
  onChange,
  rows = 3,
  className = "",
  placeholder,
  disabled = false,
  readOnly = false,
  ariaLabel,
  dataFieldKey,
  style,
  title,
  onKeyDown,
  unstyled = false,
}: TextareaFieldProps) {
  return (
    <textarea
      value={value}
      rows={rows}
      placeholder={placeholder}
      disabled={disabled}
      readOnly={readOnly}
      aria-label={ariaLabel}
      data-field-key={dataFieldKey}
      style={style}
      title={title}
      onKeyDown={onKeyDown}
      onChange={(event) => onChange?.(event.target.value)}
      className={unstyled ? className : `w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-emerald-400 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500 ${className}`}
    />
  );
}
