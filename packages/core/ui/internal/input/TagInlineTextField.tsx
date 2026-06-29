"use client";

import { forwardRef, type KeyboardEventHandler, type FocusEventHandler, type InputHTMLAttributes } from "react";
import { getTagInlineInputClassName } from "../form/FormStyles";
import { joinClassNames } from "../common/card-utils";

export interface TagInlineTextFieldProps {
  value?: string;
  onChange?: (value: string) => void;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  inputProps?: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "onBlur" | "onKeyDown" | "placeholder" | "className" | "autoFocus" | "disabled">;
}

export const TagInlineTextField = forwardRef<HTMLInputElement, TagInlineTextFieldProps>(function TagInlineTextField({
  value = "",
  onChange,
  onBlur,
  onKeyDown,
  placeholder,
  className = "",
  autoFocus,
  disabled,
  inputProps,
}, ref) {
  return (
    <input
      ref={ref}
      type="text"
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      autoFocus={autoFocus}
      disabled={disabled}
      className={joinClassNames(getTagInlineInputClassName(), className)}
      {...inputProps}
    />
  );
});

export default TagInlineTextField;
