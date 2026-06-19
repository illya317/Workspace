"use client";

import type { ReactNode } from "react";

export type SplitWorkspaceMode = "desktop" | "drawer";

export interface SplitWorkspaceProps {
  sideOpen: boolean;
  drawerOpen: boolean;
  onDrawerOpenChange: (open: boolean) => void;
  renderSide: (mode: SplitWorkspaceMode) => ReactNode;
  children: ReactNode;
}

export interface SplitWorkspaceToolbarProps {
  sideOpen: boolean;
  sideLabel: string;
  onSideOpenChange: (open: boolean) => void;
  onDrawerOpen: () => void;
  children?: ReactNode;
}

export function SplitWorkspaceToolbar({
  sideOpen,
  sideLabel,
  onSideOpenChange,
  onDrawerOpen,
  children,
}: SplitWorkspaceToolbarProps) {
  return (
    <div className="flex w-full flex-wrap items-center justify-start gap-2">
      <button
        type="button"
        onClick={onDrawerOpen}
        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 lg:hidden"
      >
        显示{sideLabel}
      </button>
      <button
        type="button"
        onClick={() => onSideOpenChange(!sideOpen)}
        className="hidden rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 lg:inline-flex"
      >
        {sideOpen ? "隐藏" : "显示"}{sideLabel}
      </button>
      {children}
    </div>
  );
}

export default function SplitWorkspace({
  sideOpen,
  drawerOpen,
  onDrawerOpenChange,
  renderSide,
  children,
}: SplitWorkspaceProps) {
  return (
    <>
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="关闭侧栏"
            onClick={() => onDrawerOpenChange(false)}
            className="absolute inset-0 bg-slate-900/25"
          />
          <div className="absolute inset-y-0 left-0 w-[min(380px,calc(100vw-32px))] bg-white p-3 shadow-2xl">
            {renderSide("drawer")}
          </div>
        </div>
      )}

      <div className={`grid grid-cols-1 gap-5 ${sideOpen ? "lg:grid-cols-[3fr_7fr]" : ""}`}>
        {sideOpen && <div className="hidden lg:block">{renderSide("desktop")}</div>}
        {children}
      </div>
    </>
  );
}
