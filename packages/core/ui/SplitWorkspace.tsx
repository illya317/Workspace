"use client";

import type { CSSProperties, ReactNode } from "react";
import { IconActionButton } from "./ActionControls";
import { Toolbar, type ToolbarItem } from "./Toolbar";

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

  const items: ToolbarItem[] = [];

  if (showSideControls) {
    items.push({
      kind: "custom",
      key: "mobile-side-toggle",
      section: "view",
      content: (
        <span className={mobileButtonShellClassName}>
          <IconActionButton
            kind="panel-open"
            label={`显示${sideLabel}`}
            onClick={onDrawerOpen}
            className="!h-9 !w-10 !px-0"
          />
        </span>
      ),
    });
    items.push({
      kind: "custom",
      key: "desktop-side-toggle",
      section: "view",
      content: (
        <span className={desktopButtonShellClassName}>
          <IconActionButton
            kind={sideOpen ? "panel-open" : "panel-close"}
            label={`${sideOpen ? "隐藏" : "显示"}${sideLabel}`}
            onClick={() => onSideOpenChange(!sideOpen)}
            variant={sideOpen ? "primary" : "secondary"}
            className="!h-9 !w-10 !px-0"
          />
        </span>
      ),
    });
  }

  if (children) {
    items.push({ kind: "custom", key: "children", section: "edit", content: children });
  }

  return <Toolbar items={items} variant="inline" className="w-full justify-start" />;
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
