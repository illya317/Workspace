"use client";

import { forwardRef, type FocusEventHandler, type KeyboardEventHandler } from "react";

export interface SearchInputProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  onFocus?: FocusEventHandler<HTMLInputElement>;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
}

const SEARCH_INPUT_CLASSES = "h-9 w-36 rounded-md border border-sky-200 bg-white px-3 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-sky-100/60 disabled:text-slate-500";

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
  onFocus,
  onBlur,
  onKeyDown,
}, ref) {
  const displayPlaceholder = getDisplayPlaceholder(placeholder);
  return (
    <input
      ref={ref}
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={displayPlaceholder}
      aria-label={ariaLabel}
      title={displayPlaceholder === placeholder ? undefined : placeholder}
      className={`${SEARCH_INPUT_CLASSES} transition ${className ?? ""}`}
      autoFocus={autoFocus}
      disabled={disabled}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    />
  );
});

export default SearchInput;
