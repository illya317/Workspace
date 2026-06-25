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

export default function SplitWorkspace({
  sideOpen,
  drawerOpen,
  onDrawerOpenChange,
  renderSide,
  children,
  splitRatio = [3, 7],
}: SplitWorkspaceProps) {
  const contentClassName = sideOpen
    ? "min-w-0 max-lg:mx-auto max-lg:w-full max-lg:max-w-[680px] lg:max-w-none"
    : "min-w-0";
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
        <div className={contentClassName}>{children}</div>
      </div>
    </>
  );
}
