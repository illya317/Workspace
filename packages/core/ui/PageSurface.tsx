"use client";

import type { ReactNode } from "react";
import { AnalysisPageFrame, DatabasePageFrame, WorkspaceSplitPage } from "./PageFrames";
import SplitWorkspace, { type SplitWorkspaceMode } from "./SplitWorkspace";
import { Toolbar, type ToolbarItem } from "./Toolbar";
import { joinClassNames } from "./card-utils";
import { renderBlocks, renderCommands, renderEmpty, renderToolbar } from "./PageSurface.blocks";
import type {
  PageSurfaceProps,
  PageSurfaceSideSpec,
  PageSurfaceSplitProps,
} from "./PageSurface.types";

export type {
  PageSurfaceAnalysisSpec,
  PageSurfaceBlockSpec,
  PageSurfaceCommandSpec,
  PageSurfaceEmptySpec,
  PageSurfaceGroupSpec,
  PageSurfaceKind,
  PageSurfaceMessageSpec,
  PageSurfaceMetricSpec,
  PageSurfaceModalSpec,
  PageSurfaceModuleGridItemSpec,
  PageSurfaceModuleGridSpec,
  PageSurfaceModuleViewSpec,
  PageSurfacePanelSpec,
  PageSurfaceProps,
  PageSurfaceSectionSpec,
  PageSurfaceSideSpec,
  PageSurfaceToolbarSpec,
} from "./PageSurface.types";

function renderSurfaceBody(props: PageSurfaceProps, options: { includePageChrome?: boolean } = {}) {
  const includePageChrome = options.includePageChrome ?? true;
  const hasBody = Boolean(props.blocks?.length);
  return (
    <>
      {includePageChrome ? renderCommands(props.actions) : null}
      {includePageChrome ? renderToolbar(props.toolbar) : null}
      {renderBlocks(props.blocks)}
      {!hasBody ? renderEmpty(props.empty) : null}
    </>
  );
}

function renderSplitBeforeSplit(props: PageSurfaceSplitProps) {
  const actions = renderCommands(props.actions);
  const toolbar = renderToolbar(props.toolbar);
  if (!actions && !toolbar) return undefined;
  return <div className="space-y-3">{actions}{toolbar}</div>;
}

function renderSideBlocks(side: PageSurfaceSideSpec, mode: SplitWorkspaceMode) {
  const blocks = mode === "drawer" ? side.drawerBlocks ?? side.blocks : side.blocks;
  return <div className={joinClassNames("space-y-4", side.className)}>{renderBlocks(blocks)}</div>;
}

function renderSplitSideControls(props: PageSurfaceSplitProps) {
  if (props.showSideControls === false) return null;
  const items: ToolbarItem[] = [
    {
      kind: "panel-toggle",
      key: "mobile-side-toggle",
      icon: "panel-open",
      label: `显示${props.sideLabel}`,
      onClick: () => props.onDrawerOpenChange(true),
      className: "lg:!hidden",
    },
    {
      kind: "panel-toggle",
      key: "desktop-side-toggle",
      icon: props.sideOpen ? "panel-open" : "panel-close",
      label: `${props.sideOpen ? "隐藏" : "显示"}${props.sideLabel}`,
      onClick: () => props.onSideOpenChange(!props.sideOpen),
      variant: props.sideOpen ? "primary" : "secondary",
      className: "!hidden lg:!inline-flex",
    },
  ];
  return <Toolbar items={items} variant="inline" className="w-full justify-start" />;
}

function renderEmbeddedSurfaceBody(props: PageSurfaceProps, body: ReactNode) {
  if (props.className && props.contentClassName) return <div className={props.className}><div className={props.contentClassName}>{body}</div></div>;
  if (props.className || props.contentClassName) return <div className={props.className ?? props.contentClassName}>{body}</div>;
  return <>{body}</>;
}

function renderEmbeddedSplitSurface(props: PageSurfaceSplitProps, body: ReactNode) {
  const content = (
    <div className={joinClassNames("space-y-5", props.className)}>
      {renderSplitSideControls(props)}
      {renderSplitBeforeSplit(props)}
      <SplitWorkspace
        sideOpen={props.sideOpen}
        drawerOpen={props.drawerOpen}
        onDrawerOpenChange={props.onDrawerOpenChange}
        renderSide={(mode) => renderSideBlocks(props.side, mode)}
        splitRatio={props.splitRatio}
      >
        {body}
      </SplitWorkspace>
    </div>
  );
  return props.contentClassName ? <div className={props.contentClassName}>{content}</div> : content;
}

export default function PageSurface(props: PageSurfaceProps) {
  if (props.kind === "split") {
    const body = renderSurfaceBody(props, { includePageChrome: false });
    if (props.embedded) return renderEmbeddedSplitSurface(props, body);
    return (
      <WorkspaceSplitPage
        sideOpen={props.sideOpen}
        drawerOpen={props.drawerOpen}
        onSideOpenChange={props.onSideOpenChange}
        onDrawerOpenChange={props.onDrawerOpenChange}
        sideLabel={props.sideLabel}
        renderSide={(mode) => renderSideBlocks(props.side, mode)}
        showSideControls={props.showSideControls}
        splitRatio={props.splitRatio}
        beforeSplit={renderSplitBeforeSplit(props)}
        className={props.className}
        contentClassName={props.contentClassName}
      >
        {body}
      </WorkspaceSplitPage>
    );
  }

  const body = renderSurfaceBody(props);
  if (props.embedded) return renderEmbeddedSurfaceBody(props, body);
  if (props.kind === "analysis") {
    return (
      <AnalysisPageFrame tabs={props.tabs} activeTab={props.activeTab} activeChild={props.activeChild} onTabChange={props.onTabChange} onChildChange={props.onChildChange} className={props.className} contentClassName={props.contentClassName}>
        {body}
      </AnalysisPageFrame>
    );
  }
  return (
    <DatabasePageFrame tabs={props.tabs} activeTab={props.activeTab} activeChild={props.activeChild} onTabChange={props.onTabChange} onChildChange={props.onChildChange} className={props.className} contentClassName={props.contentClassName}>
      {body}
    </DatabasePageFrame>
  );
}
