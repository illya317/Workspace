"use client";

import { forwardRef, type FocusEventHandler, type KeyboardEventHandler } from "react";
import { getFieldInputClassName } from "./FormStyles";

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
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  unstyled?: boolean;
}

const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField({
  value = "",
  onChange,
  type = "text",
  placeholder,
  className,
  autoFocus,
  disabled,
  readOnly,
  required,
  minLength,
  maxLength,
  inputMode,
  ariaLabel,
  onKeyDown,
  onBlur,
  unstyled = false,
}, ref) {
  return (
    <input
      ref={ref}
      type={type}
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={unstyled ? className : getFieldInputClassName(className)}
      autoFocus={autoFocus}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      minLength={minLength}
      maxLength={maxLength}
      inputMode={inputMode}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    />
  );
});

export default TextField;
