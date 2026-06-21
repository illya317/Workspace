"use client";

import type { CSSProperties, ReactNode } from "react";

export type SplitWorkspaceMode = "desktop" | "drawer";

export interface SplitWorkspaceProps {
  sideOpen: boolean;
  drawerOpen: boolean;
  onDrawerOpenChange: (open: boolean) => void;
  renderSide: (mode: SplitWorkspaceMode) => ReactNode;
  children: ReactNode;
  splitRatio?: readonly [number, number];
}

export interface SplitWorkspaceToolbarProps {
  sideOpen: boolean;
  sideLabel: string;
  onSideOpenChange: (open: boolean) => void;
  onDrawerOpen: () => void;
  showSideControls?: boolean;
  children?: ReactNode;
}

export function SplitWorkspaceToolbar({
  sideOpen,
  sideLabel,
  onSideOpenChange,
  onDrawerOpen,
  showSideControls = true,
  children,
}: SplitWorkspaceToolbarProps) {
  if (!showSideControls && !children) return null;

  return (
    <div className="flex w-full flex-wrap items-center justify-start gap-2">
      {showSideControls && (
        <>
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
        </>
      )}
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
  splitRatio = [3, 7],
}: SplitWorkspaceProps) {
  const [sideFr, contentFr] = splitRatio;
  const splitStyle = {
    "--split-side-fr": `${sideFr}fr`,
    "--split-content-fr": `${contentFr}fr`,
  } as CSSProperties;

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

      <div
        className={`grid grid-cols-1 gap-5 ${sideOpen ? "lg:grid-cols-[minmax(0,var(--split-side-fr))_minmax(0,var(--split-content-fr))]" : ""}`}
        style={splitStyle}
      >
        {sideOpen && <div className="hidden min-w-0 lg:block">{renderSide("desktop")}</div>}
        <div className="min-w-0">{children}</div>
      </div>
    </>
  );
}
