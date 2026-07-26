"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, type KeyboardEventHandler, type FocusEventHandler, type InputHTMLAttributes } from "react";
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
  const inputRef = useRef<HTMLInputElement | null>(null);
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement, []);
  useEffect(() => {
    if (!autoFocus || disabled || !inputRef.current) return;
    inputRef.current.focus({ preventScroll: true });
  }, [autoFocus, disabled]);
  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      disabled={disabled}
      className={joinClassNames(getTagInlineInputClassName(), className)}
      {...inputProps}
    />
  );
});

export default TagInlineTextField;
