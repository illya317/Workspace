"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export type DropdownMenuItem = {
  label: string;
  onSelect: () => void | Promise<void>;
  tone?: "default" | "danger";
  separatorBefore?: boolean;
};

export interface DropdownMenuProps {
  trigger: ReactNode;
  items: DropdownMenuItem[];
  align?: "left" | "right";
  ariaLabel?: string;
  className?: string;
  menuClassName?: string;
}

export default function DropdownMenu({
  trigger,
  items,
  align = "right",
  ariaLabel,
  className = "",
  menuClassName = "",
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const menuAlignClassName = align === "right" ? "right-0" : "left-0";

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm text-gray-700 transition-colors hover:bg-gray-100"
      >
        {trigger}
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute ${menuAlignClassName} z-50 mt-1 w-32 rounded-md border border-gray-200 bg-white py-1 shadow-lg ${menuClassName}`}
        >
          {items.map((item) => (
            <div key={item.label}>
              {item.separatorBefore && <div className="mx-2 my-1 border-t border-gray-100" />}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  void item.onSelect();
                }}
                className={`block w-full px-4 py-2 text-left text-sm transition-colors ${
                  item.tone === "danger"
                    ? "text-red-600 hover:bg-red-50"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                {item.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
