"use client";

import type { ReactNode } from "react";

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
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2">
          {leading}
          {leading && <span className="text-gray-300">|</span>}
          <span className="text-sm font-medium text-gray-700">{title}</span>
          <div className="flex-1" />

          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              className="rounded-md px-3 py-1.5 text-sm text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
            >
              {action.label}
            </button>
          ))}

          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="rounded-md px-3 py-1.5 text-sm text-gray-600 transition hover:bg-gray-100 hover:text-gray-800"
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
