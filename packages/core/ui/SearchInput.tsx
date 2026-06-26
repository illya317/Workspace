"use client";

import { forwardRef, type FocusEventHandler, type KeyboardEventHandler } from "react";
import { CONTROL_SIZES, getControlClassName } from "./interactionTokens";
import type { ControlSize } from "./interactionTokens";

export interface SearchInputProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  size?: ControlSize;
  onFocus?: FocusEventHandler<HTMLInputElement>;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
}

const BASE_CLASSES = "w-36 border border-slate-200 bg-white text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-slate-100 disabled:text-slate-500";

function getDisplayPlaceholder(placeholder: string) {
  if (placeholder.startsWith("搜索") && placeholder.length > 6) return "搜索";
  return placeholder;
}

const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput({
  value = "",
  onChange,
  placeholder = "搜索...",
  className,
  autoFocus,
  disabled,
  ariaLabel,
  size = "md",
  onFocus,
  onBlur,
  onKeyDown,
}, ref) {
  const displayPlaceholder = getDisplayPlaceholder(placeholder);
  const sizeClasses = getControlClassName(size);
  const minWidth = CONTROL_SIZES[size].minWidth;
  return (
    <input
      ref={ref}
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={displayPlaceholder}
      aria-label={ariaLabel}
      title={displayPlaceholder === placeholder ? undefined : placeholder}
      className={`${BASE_CLASSES} ${sizeClasses} ${minWidth} transition ${className ?? ""}`}
      autoFocus={autoFocus}
      disabled={disabled}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    />
  );
});

export default SearchInput;
