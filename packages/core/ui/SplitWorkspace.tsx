"use client";

import type { CSSProperties, ReactNode } from "react";
import { IconActionButton } from "./ActionControls";

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
  desktopBreakpoint?: "lg" | "xl";
  showSideControls?: boolean;
  children?: ReactNode;
}

export function SplitWorkspaceToolbar({
  sideOpen,
  sideLabel,
  onSideOpenChange,
  onDrawerOpen,
  desktopBreakpoint = "lg",
  showSideControls = true,
  children,
}: SplitWorkspaceToolbarProps) {
  if (!showSideControls && !children) return null;
  const mobileButtonShellClassName = desktopBreakpoint === "xl" ? "xl:hidden" : "lg:hidden";
  const desktopButtonShellClassName = desktopBreakpoint === "xl" ? "hidden xl:block" : "hidden lg:block";

  return (
    <div className="flex w-full flex-wrap items-center justify-start gap-2">
      {showSideControls && (
        <>
          <span className={mobileButtonShellClassName}>
            <IconActionButton
              label={`显示${sideLabel}`}
              onClick={onDrawerOpen}
              className="!h-9 !w-10 !px-0"
            >
              <SidePanelIcon open />
            </IconActionButton>
          </span>
          <span className={desktopButtonShellClassName}>
            <IconActionButton
              label={`${sideOpen ? "隐藏" : "显示"}${sideLabel}`}
              onClick={() => onSideOpenChange(!sideOpen)}
              variant={sideOpen ? "primary" : "secondary"}
              className="!h-9 !w-10 !px-0"
            >
              <SidePanelIcon open={sideOpen} />
            </IconActionButton>
          </span>
        </>
      )}
      {children}
    </div>
  );
}

function SidePanelIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
      {open ? <path d="m14 9 3 3-3 3" /> : <path d="m17 9-3 3 3 3" />}
    </svg>
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
