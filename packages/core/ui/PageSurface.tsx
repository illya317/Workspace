"use client";

import type { ReactNode } from "react";
import { AnalysisPageFrame, DatabasePageFrame, WorkspaceSplitPage } from "./PageFrames";
import { ModuleCard } from "./Card";
import NavigationSurface from "./NavigationSurface";
import Pagination from "./Pagination";
import SplitWorkspace, { type SplitWorkspaceMode } from "./SplitWorkspace";
import type { TabDef } from "./TabBar";
import { Toolbar, type ToolbarItem } from "./Toolbar";
import { joinClassNames } from "./card-utils";
import { renderBlocks, renderBlockStack, renderCommands, renderEmpty, renderToolbar } from "./PageSurface.blocks";
import type {
  PageSurfaceHeaderSpec,
  PageSurfaceBodySpec,
  PageSurfaceNavigationItemSpec,
  PageSurfaceNavigationSpec,
  PageSurfaceProps,
  PageSurfaceSideSpec,
  PageSurfaceSplitProps,
} from "./PageSurface.types";

export type {
  PageSurfaceActionSize,
  PageSurfaceBlockSpec,
  PageSurfaceBodySpec,
  PageSurfaceCommandSpec,
  PageSurfaceEmptySpec,
  PageSurfaceFooterSpec,
  PageSurfaceHeaderSpec,
  PageSurfaceKind,
  PageSurfaceModalSpec,
  PageSurfaceNavigationItemSpec,
  PageSurfaceNavigationSpec,
  PageSurfaceProps,
  PageSurfaceSideSpec,
  PageSurfaceSplitProps,
  PageSurfaceStandardProps,
  PageSurfaceToolbarSpec,
} from "./PageSurface.types";

function toTabDef(item: PageSurfaceNavigationItemSpec): TabDef {
  return {
    key: item.key,
    label: item.label,
    children: item.children?.map(toTabDef),
  };
}

function renderNavigation(navigation?: PageSurfaceNavigationSpec) {
  if (!navigation || navigation.hidden) return null;
  if (navigation.kind === "tabs") {
    const tabs = navigation.items.map(toTabDef);
    const hasChildren = navigation.items.some((item) => item.children?.length);
    return (
      <NavigationSurface
        kind="tabs"
        className={navigation.className}
        tabs={hasChildren
          ? {
              tabs,
              active: navigation.active,
              activeChild: navigation.activeChild,
              onChange: navigation.onChange,
              onChildChange: navigation.onChildChange,
              accordion: true,
              variant: "large",
            }
          : {
              tabs,
              active: navigation.active,
              onChange: navigation.onChange,
              variant: "large",
            }}
      />
    );
  }

  return (
    <div className={joinClassNames("grid gap-3 sm:grid-cols-2 lg:grid-cols-3", navigation.className)}>
      {navigation.items.map((item) => (
        <ModuleCard
          key={item.key}
          title={String(item.label)}
          description={item.description}
          href={item.href}
          onClick={item.onClick ?? (() => navigation.onChange(item.key))}
          className={item.key === navigation.active ? "ring-2 ring-emerald-500" : ""}
        />
      ))}
    </div>
  );
}

function renderFooter(footer?: PageSurfaceProps["footer"]) {
  if (!footer || footer.hidden) return null;
  if (footer.pagination) {
    return <div className={footer.className}><Pagination {...footer.pagination} /></div>;
  }
  return null;
}

function renderHeader(header?: PageSurfaceHeaderSpec) {
  if (!header || header.hidden) return null;
  return (
    <nav className={joinClassNames("sticky top-0 z-30 bg-white shadow-sm", header.className)}>
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2">
        {header.leading}
        {header.leading ? <span className="text-gray-300">|</span> : null}
        {header.title ? <span className="text-sm font-medium text-gray-700">{header.title}</span> : null}
        <div className="flex-1" />
        {header.backHref ? (
          <a
            href={header.backHref}
            className="rounded-md px-3 py-1.5 text-sm text-gray-600 transition hover:bg-gray-100 hover:text-gray-800"
          >
            {header.backLabel ?? "返回"}
          </a>
        ) : null}
        {header.actions}
      </div>
    </nav>
  );
}

function renderPageWithHeader(props: PageSurfaceProps, frame: ReactNode) {
  const header = renderHeader(props.header);
  if (!header) return frame;
  return (
    <div className="min-h-screen bg-gray-50">
      {header}
      {frame}
    </div>
  );
}

function renderTabs(tabs?: PageSurfaceNavigationItemSpec[]) {
  return tabs?.map(toTabDef);
}

function resolvePageBody(props: PageSurfaceProps): PageSurfaceBodySpec {
  return {
    ...props.body,
    blocks: props.body?.blocks ?? props.blocks,
    empty: props.body?.empty ?? props.empty,
    commands: props.body?.commands ?? props.actions,
  };
}

function renderSurfaceBody(props: PageSurfaceProps, options: { includePageChrome?: boolean } = {}) {
  const includePageChrome = options.includePageChrome ?? true;
  const bodySpec = resolvePageBody(props);
  const bodyBlocks = bodySpec.blocks;
  const hasBody = Boolean(bodyBlocks?.length);
  const blockLayoutClassName = bodySpec.layout === "split"
    ? "grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]"
    : "space-y-5";
  const blocks = hasBody ? renderBlockStack(bodyBlocks, undefined, blockLayoutClassName) : null;
  return (
    <div className="space-y-4">
      {includePageChrome ? renderCommands(bodySpec.commands) : null}
      {includePageChrome && !props.toolbar?.hidden ? renderToolbar(props.toolbar) : null}
      {blocks}
      {!hasBody ? renderEmpty(bodySpec.empty) : null}
      {includePageChrome ? renderFooter(props.footer) : null}
    </div>
  );
}

function renderPageToolbar(props: PageSurfaceProps) {
  const commands = renderCommands(resolvePageBody(props).commands);
  const toolbar = props.toolbar?.hidden ? null : renderToolbar(props.toolbar);
  if (!commands && !toolbar) return null;
  if (!commands) return toolbar;
  if (!toolbar) return commands;
  return <div className="space-y-3">{commands}{toolbar}</div>;
}

function renderSplitBeforeSplit(props: PageSurfaceSplitProps) {
  const actions = renderCommands(resolvePageBody(props).commands);
  const toolbar = props.toolbar?.hidden ? null : renderToolbar(props.toolbar);
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
      visibility: "mobile",
    },
    {
      kind: "panel-toggle",
      key: "desktop-side-toggle",
      icon: props.sideOpen ? "panel-open" : "panel-close",
      label: `${props.sideOpen ? "隐藏" : "显示"}${props.sideLabel}`,
      onClick: () => props.onSideOpenChange(!props.sideOpen),
      variant: props.sideOpen ? "primary" : "secondary",
      visibility: "desktop",
    },
  ];
  return <Toolbar items={items} />;
}

function renderEmbeddedSurfaceBody(props: PageSurfaceProps, body: ReactNode) {
  const content = (
    <div className={joinClassNames("space-y-5", props.className)}>
      {renderNavigation(props.navigation)}
      {body}
    </div>
  );
  if (props.contentClassName) return <div className={props.contentClassName}>{content}</div>;
  return content;
}

function renderEmbeddedSplitSurface(props: PageSurfaceSplitProps, body: ReactNode) {
  const content = (
    <div className={joinClassNames("space-y-5", props.className)}>
      {renderNavigation(props.navigation)}
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
      {renderFooter(props.footer)}
    </div>
  );
  return props.contentClassName ? <div className={props.contentClassName}>{content}</div> : content;
}

export default function PageSurface(props: PageSurfaceProps) {
  if (props.kind === "split") {
    const body = renderSurfaceBody(props, { includePageChrome: false });
    if (props.embedded) return renderEmbeddedSplitSurface(props, body);
    return renderPageWithHeader(props, (
      <WorkspaceSplitPage
        tabs={props.navigation?.kind === "tabs" && !props.navigation.hidden ? props.navigation.items.map(toTabDef) : renderTabs(props.tabs)}
        activeTab={props.navigation?.kind === "tabs" && !props.navigation.hidden ? props.navigation.active : props.activeTab}
        activeChild={props.navigation?.kind === "tabs" && !props.navigation.hidden ? props.navigation.activeChild : props.activeChild}
        onTabChange={props.navigation?.kind === "tabs" && !props.navigation.hidden ? props.navigation.onChange : props.onTabChange}
        onChildChange={props.navigation?.kind === "tabs" && !props.navigation.hidden ? props.navigation.onChildChange : props.onChildChange}
        sideOpen={props.sideOpen}
        drawerOpen={props.drawerOpen}
        onSideOpenChange={props.onSideOpenChange}
        onDrawerOpenChange={props.onDrawerOpenChange}
        sideLabel={props.sideLabel}
        renderSide={(mode) => renderSideBlocks(props.side, mode)}
        showSideControls={props.showSideControls}
        splitRatio={props.splitRatio}
        beforeSplit={renderSplitBeforeSplit(props)}
        footer={renderFooter(props.footer)}
        className={props.className}
        contentClassName={props.contentClassName}
      >
        {body}
      </WorkspaceSplitPage>
    ));
  }

  const body = renderSurfaceBody(props, { includePageChrome: Boolean(props.embedded) });
  if (props.embedded) return renderEmbeddedSurfaceBody(props, body);
  if (props.kind === "analysis") {
    return renderPageWithHeader(props, (
      <AnalysisPageFrame
        tabs={props.navigation?.kind === "tabs" && !props.navigation.hidden ? props.navigation.items.map(toTabDef) : renderTabs(props.tabs)}
        activeTab={props.navigation?.kind === "tabs" && !props.navigation.hidden ? props.navigation.active : props.activeTab}
        activeChild={props.navigation?.kind === "tabs" && !props.navigation.hidden ? props.navigation.activeChild : props.activeChild}
        onTabChange={props.navigation?.kind === "tabs" && !props.navigation.hidden ? props.navigation.onChange : props.onTabChange}
        onChildChange={props.navigation?.kind === "tabs" && !props.navigation.hidden ? props.navigation.onChildChange : props.onChildChange}
        summary={props.navigation?.kind === "cards" ? renderNavigation(props.navigation) : undefined}
        toolbar={renderPageToolbar(props)}
        footer={renderFooter(props.footer)}
        className={props.className}
        contentClassName={props.contentClassName}
      >
        {body}
      </AnalysisPageFrame>
    ));
  }
  return renderPageWithHeader(props, (
    <DatabasePageFrame
      tabs={props.navigation?.kind === "tabs" && !props.navigation.hidden ? props.navigation.items.map(toTabDef) : renderTabs(props.tabs)}
      activeTab={props.navigation?.kind === "tabs" && !props.navigation.hidden ? props.navigation.active : props.activeTab}
      activeChild={props.navigation?.kind === "tabs" && !props.navigation.hidden ? props.navigation.activeChild : props.activeChild}
      onTabChange={props.navigation?.kind === "tabs" && !props.navigation.hidden ? props.navigation.onChange : props.onTabChange}
      onChildChange={props.navigation?.kind === "tabs" && !props.navigation.hidden ? props.navigation.onChildChange : props.onChildChange}
      summary={props.navigation?.kind === "cards" ? renderNavigation(props.navigation) : undefined}
      toolbar={renderPageToolbar(props)}
      footer={renderFooter(props.footer)}
      className={props.className}
      contentClassName={props.contentClassName}
    >
      {body}
    </DatabasePageFrame>
  ));
}
