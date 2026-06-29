"use client";

import type { ReactNode } from "react";
import { DatabasePageFrame, WorkspaceSplitPage } from "./internal/page/PageFrames";
import PageContent from "./internal/page/PageContent";
import BlockSurface from "./BlockSurface";
import NavigationSurface from "./NavigationSurface";
import Pagination from "./internal/common/Pagination";
import SplitWorkspace, { type SplitWorkspaceMode } from "./internal/common/SplitWorkspace";
import type { TabDef } from "./internal/common/TabBar";
import { Toolbar, type ToolbarItem } from "./Toolbar";
import { renderCommands, renderEmpty, renderSectionStack, renderToolbar } from "./internal/page/PageSurface.sections";
import type {
  PageSurfaceCompleteBodySpec,
  PageSurfaceDirectoryProps,
  PageSurfaceNavigationItemSpec,
  PageSurfaceNavigationSpec,
  PageSurfaceProps,
  PageSurfaceSectionSpec,
  PageSurfaceSplitBodySpec,
} from "./PageSurface.types";

export type {
  PageSurfaceActionSize,
  PageSurfaceBodyKind,
  PageSurfaceBodySpec,
  PageSurfaceCommandSpec,
  PageSurfaceCompleteBodySpec,
  PageSurfaceEmptySpec,
  PageSurfaceFooterSpec,
  PageSurfaceKind,
  PageSurfaceDirectoryProps,
  PageSurfaceLoginProps,
  PageSurfaceModalSpec,
  PageSurfaceNavigationItemSpec,
  PageSurfaceNavigationSpec,
  PageSurfaceProps,
  PageSurfaceBadgeSpec,
  PageSurfaceSectionHeaderSpec,
  PageSurfaceSectioningSpec,
  PageSurfaceSectionSpec,
  PageSurfaceSplitBodySpec,
  PageSurfaceSplitPaneSpec,
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
  if (!navigation) return null;
  const tabs = navigation.items.map(toTabDef);
  const hasChildren = navigation.items.some((item) => item.children?.length);
  return (
    <NavigationSurface
      kind="tabs"
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

function renderFooter(footer?: PageSurfaceProps["footer"]) {
  if (!footer || footer.hidden) return null;
  if (footer.pagination) {
    return <div><Pagination {...footer.pagination} /></div>;
  }
  return null;
}

function renderBodyTitle(bodySpec: PageSurfaceCompleteBodySpec) {
  if (!bodySpec.title && !bodySpec.description) return null;
  return (
    <div className="space-y-1">
      {bodySpec.title ? <h2 className="text-lg font-semibold text-slate-900">{bodySpec.title}</h2> : null}
      {bodySpec.description ? <p className="text-sm text-slate-500">{bodySpec.description}</p> : null}
    </div>
  );
}

function renderBodySections(bodySpec: PageSurfaceCompleteBodySpec) {
  return renderSectionStack(bodySpec.sections, bodySpec.sectioning);
}

function renderPageFrame(_props: PageSurfaceProps, frame: ReactNode) {
  return frame;
}

function completeBody(body?: PageSurfaceProps["body"]): PageSurfaceCompleteBodySpec {
  if (!body) return { kind: "complete" };
  if (body.kind === "complete") return body;
  return body.right;
}

function renderCompleteBody(props: PageSurfaceProps, bodySpec: PageSurfaceCompleteBodySpec, options: { includePageChrome?: boolean } = {}) {
  const includePageChrome = options.includePageChrome ?? true;
  const bodySections = renderBodySections(bodySpec);
  const hasBody = Boolean(bodySpec.sections?.length);
  return (
    <div className="space-y-4">
      {includePageChrome ? renderCommands(bodySpec.commands) : null}
      {includePageChrome && !props.toolbar?.hidden ? renderToolbar(props.toolbar) : null}
      {renderBodyTitle(bodySpec)}
      {bodySections}
      {!hasBody ? renderEmpty(bodySpec.empty) : null}
      {includePageChrome ? renderFooter(props.footer) : null}
    </div>
  );
}

function renderPageToolbar(props: PageSurfaceProps) {
  const commands = renderCommands(completeBody(props.body).commands);
  const toolbar = props.toolbar?.hidden ? null : renderToolbar(props.toolbar);
  if (!commands && !toolbar) return null;
  if (!commands) return toolbar;
  if (!toolbar) return commands;
  return <div className="space-y-3">{commands}{toolbar}</div>;
}

function renderSplitBeforeSplit(props: PageSurfaceProps, split: PageSurfaceSplitBodySpec) {
  const actions = renderCommands(split.right.commands);
  const toolbar = props.toolbar?.hidden ? null : renderToolbar(props.toolbar);
  if (!actions && !toolbar) return undefined;
  return <div className="space-y-3">{actions}{toolbar}</div>;
}

function paneBlocks(pane: PageSurfaceSplitBodySpec["left"], mode: SplitWorkspaceMode) {
  const sections = mode === "drawer" ? pane.drawerSections ?? pane.sections : pane.sections;
  return (
    <div className="space-y-4">
      {pane.title ? <h2 className="text-base font-semibold text-slate-900">{pane.title}</h2> : null}
      {renderSectionStack(sections)}
    </div>
  );
}

function renderSplitSideControls(split: PageSurfaceSplitBodySpec) {
  if (split.showSideControls === false) return null;
  const items: ToolbarItem[] = [
    {
      kind: "panel-toggle",
      key: "mobile-side-toggle",
      icon: "panel-open",
      label: `显示${split.sideLabel}`,
      onClick: () => split.onDrawerOpenChange(true),
      visibility: "mobile",
    },
    {
      kind: "panel-toggle",
      key: "desktop-side-toggle",
      icon: split.sideOpen ? "panel-open" : "panel-close",
      label: `${split.sideOpen ? "隐藏" : "显示"}${split.sideLabel}`,
      onClick: () => split.onSideOpenChange(!split.sideOpen),
      variant: split.sideOpen ? "primary" : "secondary",
      visibility: "desktop",
    },
  ];
  return <Toolbar items={items} />;
}

function renderEmbeddedSurfaceBody(props: PageSurfaceProps, body: ReactNode) {
  const content = (
    <div className="space-y-5">
      {renderNavigation(props.navigation)}
      {body}
    </div>
  );
  return content;
}

function renderEmbeddedSplitSurface(props: PageSurfaceProps, split: PageSurfaceSplitBodySpec, body: ReactNode) {
  const content = (
    <div className="space-y-5">
      {renderNavigation(props.navigation)}
      {renderSplitSideControls(split)}
      {renderSplitBeforeSplit(props, split)}
      <SplitWorkspace
        sideOpen={split.sideOpen}
        drawerOpen={split.drawerOpen}
        onDrawerOpenChange={split.onDrawerOpenChange}
        renderSide={(mode) => paneBlocks(split.left, mode)}
        splitRatio={split.splitRatio}
      >
        {body}
      </SplitWorkspace>
      {renderFooter(props.footer)}
    </div>
  );
  return content;
}

function normalizeWorkspaceRoute(pathname: string) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const withoutBase = basePath && pathname.startsWith(basePath)
    ? pathname.slice(basePath.length)
    : pathname;
  return withoutBase.split("/").filter(Boolean);
}

function routeSegments() {
  if (typeof window === "undefined") return undefined;
  return normalizeWorkspaceRoute(window.location.pathname);
}

function hasSectionKind(
  sections: PageSurfaceSectionSpec[] | undefined,
  predicate: (section: PageSurfaceSectionSpec) => boolean,
): boolean {
  if (!sections?.length) return false;
  return sections.some((section) => {
    if (predicate(section)) return true;
    if (section.kind === "sections") return hasSectionKind(section.sections, predicate);
    return false;
  });
}

function hasLoginForm(body?: PageSurfaceProps["body"]) {
  const bodySpec = completeBody(body);
  return hasSectionKind(bodySpec.sections, (section) => section.kind === "form" && section.surface.kind === "login");
}

function hasDirectoryContent(body?: PageSurfaceProps["body"]) {
  const bodySpec = completeBody(body);
  return hasSectionKind(
    bodySpec.sections,
    (section) => section.kind === "block" && (section.surface.kind === "moduleGrid" || section.surface.kind === "empty"),
  );
}

function assertPageSurfaceKind(props: PageSurfaceProps) {
  const kind = props.kind ?? "standard";
  const segments = routeSegments();

  if (kind === "login") {
    if (props.navigation) throw new Error("PageSurface kind=\"login\" cannot declare navigation.");
    if (!hasLoginForm(props.body)) throw new Error("PageSurface kind=\"login\" must contain a login FormSurface.");
    if (segments && segments[0] !== "login") throw new Error("PageSurface kind=\"login\" can only be used on the login route.");
    return;
  }

  if (kind === "directory") {
    if (props.navigation) throw new Error("PageSurface kind=\"directory\" cannot declare navigation.");
    if (props.toolbar) throw new Error("PageSurface kind=\"directory\" cannot declare toolbar.");
    if (!hasDirectoryContent(props.body)) throw new Error("PageSurface kind=\"directory\" must contain module entries or an empty directory state.");
    if (segments) {
      const isPortalDirectory = (segments.length === 1 && segments[0] === "portal")
        || (segments.length === 2 && segments[0] === "workspace" && segments[1] === "portal");
      const isResourceDirectory = segments.length >= 1 && segments.length <= 2 && segments[0] !== "login" && segments[0] !== "portal";
      if (!isPortalDirectory && !isResourceDirectory) {
        throw new Error("PageSurface kind=\"directory\" can only be used on portal or L1/L2 resource routes.");
      }
    }
  }
}

function renderDirectorySection(section: PageSurfaceSectionSpec): ReactNode {
  if (section.kind === "block") {
    if (section.surface.kind === "moduleGrid") return <BlockSurface key={section.key} {...section.surface} centered />;
    return <BlockSurface key={section.key} {...section.surface} />;
  }
  if (section.kind === "sections") {
    return (
      <div key={section.key} className="space-y-5">
        {section.header?.title ? <h1 className="text-center text-2xl font-bold text-gray-800">{section.header.title}</h1> : null}
        {section.sections.map(renderDirectorySection)}
      </div>
    );
  }
  return null;
}

function renderDirectorySurface(props: PageSurfaceDirectoryProps) {
  const bodySpec = completeBody(props.body);
  const sections = bodySpec.sections?.map(renderDirectorySection);
  return (
    <PageContent className="py-10">
      <div className="space-y-5">{sections?.length ? sections : renderEmpty(bodySpec.empty)}</div>
    </PageContent>
  );
}

function renderLoginBody(props: PageSurfaceProps) {
  const bodySpec = completeBody(props.body);
  const contentSection = bodySpec.sections?.find(
    (section) => section.kind === "block" && section.surface.kind === "content",
  );
  if (contentSection?.kind === "block") return <BlockSurface {...contentSection.surface} />;
  return renderCompleteBody(props, bodySpec, { includePageChrome: false });
}

export default function PageSurface(props: PageSurfaceProps) {
  assertPageSurfaceKind(props);
  if (props.kind === "login") {
    return renderLoginBody(props);
  }

  if (props.kind === "directory") {
    return renderDirectorySurface(props);
  }

  if (props.body?.kind === "split") {
    const split = props.body;
    const body = renderCompleteBody(props, split.right, { includePageChrome: false });
    const tabsNavigation = props.navigation?.kind === "tabs" ? props.navigation : undefined;
    if (props.embedded) return renderEmbeddedSplitSurface(props, split, body);
    return renderPageFrame(props, (
      <WorkspaceSplitPage
        tabs={tabsNavigation?.items.map(toTabDef)}
        activeTab={tabsNavigation?.active}
        activeChild={tabsNavigation?.activeChild}
        onTabChange={tabsNavigation?.onChange}
        onChildChange={tabsNavigation?.onChildChange}
        sideOpen={split.sideOpen}
        drawerOpen={split.drawerOpen}
        onSideOpenChange={split.onSideOpenChange}
        onDrawerOpenChange={split.onDrawerOpenChange}
        sideLabel={split.sideLabel}
        renderSide={(mode) => paneBlocks(split.left, mode)}
        showSideControls={split.showSideControls}
        splitRatio={split.splitRatio}
        beforeSplit={renderSplitBeforeSplit(props, split)}
        footer={renderFooter(props.footer)}
      >
        {body}
      </WorkspaceSplitPage>
    ));
  }

  const bodySpec = completeBody(props.body);
  const body = renderCompleteBody(props, bodySpec, { includePageChrome: Boolean(props.embedded) });
  if (props.embedded) return renderEmbeddedSurfaceBody(props, body);
  const tabsNavigation = props.navigation?.kind === "tabs" ? props.navigation : undefined;
  return renderPageFrame(props, (
    <DatabasePageFrame
      tabs={tabsNavigation?.items.map(toTabDef)}
      activeTab={tabsNavigation?.active}
      activeChild={tabsNavigation?.activeChild}
      onTabChange={tabsNavigation?.onChange}
      onChildChange={tabsNavigation?.onChildChange}
      summary={undefined}
      toolbar={renderPageToolbar(props)}
      footer={renderFooter(props.footer)}
    >
      {body}
    </DatabasePageFrame>
  ));
}
