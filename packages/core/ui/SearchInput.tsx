"use client";

import { forwardRef, type FocusEventHandler, type KeyboardEventHandler } from "react";

export type SearchInputSize = "page" | "toolbar" | "compact";

export interface SearchInputProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  size?: SearchInputSize;
  ariaLabel?: string;
  onFocus?: FocusEventHandler<HTMLInputElement>;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
}

const SIZE_CLASSES: Record<SearchInputSize, string> = {
  page: "h-16 w-full rounded-xl border-2 border-emerald-500 bg-white px-6 text-2xl text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-500",
  toolbar: "h-10 w-36 rounded-lg border-2 border-emerald-500 bg-white px-3 py-0 text-xs font-semibold leading-none text-slate-900 shadow-sm placeholder:font-semibold placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-500",
  compact: "h-9 w-full rounded-md border border-sky-200 bg-white px-3 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-sky-100/60 disabled:text-slate-500",
};

function getDisplayPlaceholder(placeholder: string, size: SearchInputSize) {
  if (size !== "toolbar") return placeholder;
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
  size = "toolbar",
  ariaLabel,
  onFocus,
  onBlur,
  onKeyDown,
}, ref) {
  const displayPlaceholder = getDisplayPlaceholder(placeholder, size);
  return (
    <input
      ref={ref}
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={displayPlaceholder}
      aria-label={ariaLabel}
      title={displayPlaceholder === placeholder ? undefined : placeholder}
      className={`${SIZE_CLASSES[size]} transition ${className ?? ""}`}
      autoFocus={autoFocus}
      disabled={disabled}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    />
  );
});

export default SearchInput;
