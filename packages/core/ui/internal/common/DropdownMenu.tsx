"use client";

import { type ReactNode } from "react";
import DropdownSurface, { getDropdownItemClassName } from "./DropdownSurface";

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
  return (
    <DropdownSurface
      align={align}
      className={className}
      surfaceClassName={`w-32 py-1 ${menuClassName}`}
      trigger={({ open, toggle }) => (
        <button
          type="button"
          aria-label={ariaLabel}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={toggle}
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
      )}
    >
      {({ close }) => (
        <div role="menu">
          {items.map((item) => (
            <div key={item.label}>
              {item.separatorBefore && <div className="mx-2 my-1 border-t border-gray-100" />}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  close();
                  void item.onSelect();
                }}
                className={getDropdownItemClassName({ tone: item.tone })}
              >
                {item.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </DropdownSurface>
  );
}
