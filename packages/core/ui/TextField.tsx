"use client";

import { forwardRef, type CSSProperties, type FocusEventHandler, type KeyboardEventHandler } from "react";
import FieldInputShell, { type FieldInputShellProps } from "./FieldInputShell";
import type { FieldControlSize } from "./FormStyles";

export interface TextFieldProps {
  value?: string;
  onChange?: (value: string) => void;
  type?: "text" | "password" | "email" | "tel" | "url" | "number";
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  minLength?: number;
  maxLength?: number;
  inputMode?: "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search";
  ariaLabel?: string;
  dataFieldKey?: string;
  style?: CSSProperties;
  title?: string;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  onFocus?: FocusEventHandler<HTMLInputElement>;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  unstyled?: boolean;
  size?: FieldControlSize;
  density?: FieldInputShellProps["density"];
}

const UNSTYLED_INPUT_CLASS_NAME =
  "h-full w-full min-w-0 border-0 bg-transparent p-0 text-sm leading-none text-current outline-none placeholder:text-slate-400 disabled:bg-transparent disabled:text-slate-500";

const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  {
    value = "",
    onChange,
    type = "text",
    placeholder,
    className,
    autoFocus,
    disabled,
    readOnly,
    required,
    min,
    max,
    step,
    minLength,
    maxLength,
    inputMode,
    ariaLabel,
    dataFieldKey,
    style,
    title,
    onKeyDown,
    onFocus,
    onBlur,
    unstyled = false,
    size = "md",
    density = "normal",
  },
  ref,
) {
  const input = (
    <input
      ref={ref}
      type={type}
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      data-field-key={dataFieldKey}
      style={unstyled ? style : undefined}
      className={unstyled ? className : UNSTYLED_INPUT_CLASS_NAME}
      title={title}
      autoFocus={autoFocus}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      min={min}
      max={max}
      step={step}
      minLength={minLength}
      maxLength={maxLength}
      inputMode={inputMode}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  );
  if (unstyled) return input;
  return (
    <FieldInputShell disabled={disabled} readOnly={readOnly} size={size} density={density} className={className} style={style}>
      {input}
    </FieldInputShell>
  );
});

export default TextField;
