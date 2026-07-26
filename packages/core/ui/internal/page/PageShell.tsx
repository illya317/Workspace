"use client";

import type { ReactNode } from "react";
import { textOverflowTitle } from "../common/text-overflow";

export interface PageShellAction {
  label: string;
  onClick: () => void;
}

export interface PageShellProps {
  title: string;
  children: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  backLabel?: string;
  onBack?: () => void;
  actions?: PageShellAction[];
}

export default function PageShell({
  title,
  children,
  leading,
  trailing,
  backLabel = "返回",
  onBack,
  actions = [],
}: PageShellProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="sticky top-0 z-30 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4">
          {leading}
          {leading && <span className="hidden text-gray-300 sm:inline">|</span>}
          <span className="min-w-0 truncate text-sm font-medium text-gray-700" title={textOverflowTitle(title)}>{title}</span>
          <div className="flex-1" />

          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              className="hidden rounded-md px-3 py-1.5 text-sm text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 sm:inline-flex"
            >
              {action.label}
            </button>
          ))}

          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="h-10 shrink-0 rounded-md px-2.5 text-sm text-gray-600 transition hover:bg-gray-100 hover:text-gray-800 sm:h-auto sm:px-3 sm:py-1.5"
            >
              {backLabel}
            </button>
          )}

          {trailing}
        </div>
      </nav>

      {children}
    </div>
  );
}
