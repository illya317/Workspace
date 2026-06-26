"use client";

import { useEffect, type ReactNode, type RefObject } from "react";

export function SelectFieldDropdown({
  open,
  shouldSearch,
  searchRef,
  onQueryChange,
  children,
}: {
  open: boolean;
  shouldSearch: boolean;
  searchRef: RefObject<HTMLInputElement | null>;
  onQueryChange: (value: string) => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    if (shouldSearch) setTimeout(() => searchRef.current?.focus(), 0);
    return () => onQueryChange("");
  }, [open, shouldSearch, onQueryChange, searchRef]);

  return children;
}

export function SelectFieldChevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}
