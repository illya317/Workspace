"use client";

export interface SearchInputProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

export default function SearchInput({
  value = "",
  onChange,
  placeholder = "搜索...",
  className = "w-36 rounded border border-gray-200 px-2 py-1 text-xs focus:border-emerald-400 focus:outline-none",
  autoFocus,
}: SearchInputProps) {
  return (
    <input
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={className}
      autoFocus={autoFocus}
    />
  );
}
