"use client";

import type { CSSProperties, KeyboardEventHandler } from "react";
import { getTextareaInputClassName } from "./FormStyles";
import { joinClassNames } from "./card-utils";

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
  fontRole?: "default" | "mono";
  state?: "default" | "error" | "info";
  resize?: "none" | "vertical" | "both";
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
  fontRole = "default",
  state = "default",
  resize = "both",
}: TextareaFieldProps) {
  const fontClass = fontRole === "mono" ? "font-mono" : "";
  const stateClass = state === "error"
    ? "border-red-300 focus:border-red-500 focus:ring-red-500"
    : state === "info"
      ? "border-sky-200 focus:border-sky-500 focus:ring-sky-500 disabled:bg-sky-100/60"
      : "";
  const resizeClass = resize === "vertical" ? "resize-y" : resize === "none" ? "resize-none" : "";
  const semanticClassName = joinClassNames(fontClass, stateClass, resizeClass, className);
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
      className={unstyled ? semanticClassName : getTextareaInputClassName(semanticClassName)}
    />
  );
}
