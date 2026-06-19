"use client";

import type { ReactNode } from "react";

export type SplitWorkspaceMode = "desktop" | "drawer";

export default function SplitWorkspace({
  sideOpen,
  drawerOpen,
  onDrawerOpenChange,
  renderSide,
  children,
}: {
  sideOpen: boolean;
  drawerOpen: boolean;
  onDrawerOpenChange: (open: boolean) => void;
  renderSide: (mode: SplitWorkspaceMode) => ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      {drawerOpen && (
        <div className="fixed inset-0 z-40 xl:hidden">
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

      <div className={`grid grid-cols-1 gap-5 ${sideOpen ? "xl:grid-cols-[3fr_7fr]" : ""}`}>
        {sideOpen && <div className="hidden xl:block">{renderSide("desktop")}</div>}
        {children}
      </div>
    </>
  );
}
