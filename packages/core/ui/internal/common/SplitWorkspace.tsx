"use client";

import { Button, Splitter } from "antd";
import { useEffect, useState, type ReactNode } from "react";
import type { BodySurfaceSplitMasterPresentation } from "../../BodySurface.types";
import { ActionGlyph } from "../action/ActionGlyphs";
import { SplitWorkspaceMasterPresentationProvider } from "./SplitWorkspaceMasterContext";

export type SplitWorkspaceMode = "desktop" | "mobile";

export interface SplitWorkspaceProps {
  sideOpen: boolean;
  sideLabel: string;
  renderSide: (mode: SplitWorkspaceMode, onNavigateToDetail?: () => void) => ReactNode;
  children: ReactNode;
  splitRatio?: readonly [number, number];
  desktopPresentation?: "ratio" | "fixed-sidebar";
  masterPresentation?: BodySurfaceSplitMasterPresentation;
  mobileDetailActive?: boolean;
  onMobileNavigateToList?: () => void;
}

export function resolveSplitWorkspacePanelSize(
  splitRatio: readonly [number, number] | undefined,
  presentation: "ratio" | "fixed-sidebar",
) {
  if (presentation === "fixed-sidebar") return 400;
  const [side, detail] = splitRatio ?? [3, 7];
  return `${Math.round((side / Math.max(1, side + detail)) * 100)}%`;
}

function MobileSplitWorkspace({
  sideLabel, renderSide, children, mobileDetailActive, onMobileNavigateToList,
}: Pick<SplitWorkspaceProps, "sideLabel" | "renderSide" | "children" | "mobileDetailActive" | "onMobileNavigateToList">) {
  const [pane, setPane] = useState<"list" | "detail">(mobileDetailActive ? "detail" : "list");
  useEffect(() => {
    if (mobileDetailActive !== undefined) setPane(mobileDetailActive ? "detail" : "list");
  }, [mobileDetailActive]);
  if (pane === "list") {
    return <div className="lg:hidden" data-mobile-split-pane="list">{renderSide("mobile", () => setPane("detail"))}</div>;
  }
  return (
    <div className="min-w-0 lg:hidden" data-mobile-split-pane="detail">
      <div className="mb-3 flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-2 shadow-sm">
        <Button
          aria-label={`返回${sideLabel}`}
          icon={<ActionGlyph kind="back" className="size-5" />}
          onClick={() => { setPane("list"); onMobileNavigateToList?.(); }}
          shape="circle"
          size="large"
          title={`返回${sideLabel}`}
          type="text"
        />
        <div className="min-w-0">
          <div className="text-xs font-medium text-slate-400">详情</div>
          <div className="truncate text-sm font-semibold text-slate-900" title={sideLabel}>{sideLabel}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

export default function SplitWorkspace({
  sideOpen, sideLabel, renderSide, children, splitRatio, desktopPresentation,
  masterPresentation = "default", mobileDetailActive, onMobileNavigateToList,
}: SplitWorkspaceProps) {
  const presentation = desktopPresentation ?? (splitRatio ? "ratio" : masterPresentation === "compact" ? "fixed-sidebar" : "ratio");
  const requestedPanelSize = resolveSplitWorkspacePanelSize(splitRatio, presentation);
  const [panelSize, setPanelSize] = useState<number | string>(requestedPanelSize);
  useEffect(() => setPanelSize(requestedPanelSize), [requestedPanelSize]);
  return (
    <>
      <MobileSplitWorkspace
        mobileDetailActive={mobileDetailActive}
        onMobileNavigateToList={onMobileNavigateToList}
        renderSide={renderSide}
        sideLabel={sideLabel}
      >
        {children}
      </MobileSplitWorkspace>
      <div className="hidden min-w-0 lg:block" data-desktop-split-workspace="true" data-ui-renderer="antd">
        {sideOpen ? (
          <Splitter
            onResize={(sizes) => { if (presentation !== "fixed-sidebar") setPanelSize(sizes[0] ?? requestedPanelSize); }}
            orientation="horizontal"
            style={{ minHeight: 0 }}
          >
            <Splitter.Panel
              size={panelSize}
              max={presentation === "fixed-sidebar" ? 400 : "70%"}
              min={presentation === "fixed-sidebar" ? 400 : "20%"}
              resizable={presentation !== "fixed-sidebar"}
            >
              <div className="min-w-0 pr-3">
                <SplitWorkspaceMasterPresentationProvider presentation={masterPresentation}>
                  {renderSide("desktop")}
                </SplitWorkspaceMasterPresentationProvider>
              </div>
            </Splitter.Panel>
            <Splitter.Panel min="30%">
              <div className="min-w-0 pl-3">{children}</div>
            </Splitter.Panel>
          </Splitter>
        ) : <div className="min-w-0">{children}</div>}
      </div>
    </>
  );
}
