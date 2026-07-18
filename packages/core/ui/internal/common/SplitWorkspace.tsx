"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ActionGlyph } from "../action/ActionGlyphs";

export type SplitWorkspaceMode = "desktop" | "mobile";

export interface SplitWorkspaceProps {
  sideOpen: boolean;
  sideLabel: string;
  renderSide: (mode: SplitWorkspaceMode, onNavigateToDetail?: () => void) => ReactNode;
  children: ReactNode;
  splitRatio?: readonly [number, number];
  desktopPresentation?: "ratio" | "fixed-sidebar";
  mobileDetailActive?: boolean;
  onMobileNavigateToList?: () => void;
}

function MobileSplitWorkspace({
  sideLabel,
  renderSide,
  children,
  mobileDetailActive,
  onMobileNavigateToList,
}: Pick<SplitWorkspaceProps, "sideLabel" | "renderSide" | "children" | "mobileDetailActive" | "onMobileNavigateToList">) {
  const [pane, setPane] = useState<"list" | "detail">(mobileDetailActive ? "detail" : "list");

  useEffect(() => {
    if (mobileDetailActive !== undefined) setPane(mobileDetailActive ? "detail" : "list");
  }, [mobileDetailActive]);

  if (pane === "list") {
    return (
      <div className="lg:hidden" data-mobile-split-pane="list">
        {renderSide("mobile", () => setPane("detail"))}
      </div>
    );
  }

  return (
    <div className="min-w-0 lg:hidden" data-mobile-split-pane="detail">
      <div className="mb-3 flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-2 shadow-sm">
        <button
          type="button"
          aria-label={`返回${sideLabel}`}
          title={`返回${sideLabel}`}
          onClick={() => {
            setPane("list");
            onMobileNavigateToList?.();
          }}
          className="grid size-10 shrink-0 place-items-center rounded-lg text-slate-600 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
        >
          <ActionGlyph kind="back" className="size-5" />
        </button>
        <div className="min-w-0">
          <div className="text-xs font-medium text-slate-400">详情</div>
          <div className="truncate text-sm font-semibold text-slate-900">{sideLabel}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

export default function SplitWorkspace({
  sideOpen,
  sideLabel,
  renderSide,
  children,
  splitRatio = [3, 7],
  desktopPresentation = "ratio",
  mobileDetailActive,
  onMobileNavigateToList,
}: SplitWorkspaceProps) {
  const [sideFr, contentFr] = splitRatio;
  const splitStyle = {
    "--split-side-fr": `${sideFr}fr`,
    "--split-content-fr": `${contentFr}fr`,
  } as CSSProperties;
  const desktopColumns = desktopPresentation === "fixed-sidebar"
    ? "lg:grid-cols-[25rem_minmax(0,1fr)]"
    : "lg:grid-cols-[minmax(0,var(--split-side-fr))_minmax(0,var(--split-content-fr))]";

  return (
    <>
      <MobileSplitWorkspace
        sideLabel={sideLabel}
        renderSide={renderSide}
        mobileDetailActive={mobileDetailActive}
        onMobileNavigateToList={onMobileNavigateToList}
      >
        {children}
      </MobileSplitWorkspace>

      <div
        className={`hidden gap-5 lg:grid ${sideOpen ? desktopColumns : "grid-cols-1"}`}
        style={splitStyle}
      >
        {sideOpen && <div className="min-w-0">{renderSide("desktop")}</div>}
        <div className="min-w-0">{children}</div>
      </div>
    </>
  );
}
