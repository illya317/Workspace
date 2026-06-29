"use client";

import type { ReactNode } from "react";
import { workspaceBasePath } from "@workspace/core/routing";
import { DatabasePageFrame, WorkspaceSplitPage } from "./internal/page/PageFrames";
import NavigationRenderer from "./NavigationRenderer";
import Pagination from "./internal/common/Pagination";
import SplitWorkspace, { type SplitWorkspaceMode } from "./internal/common/SplitWorkspace";
import SelectorSurface from "./SelectorSurface";
import type { TabDef } from "./internal/common/TabBar";
import { Toolbar, type ToolbarItem } from "./Toolbar";
import { EmptyStateCard, ModuleCard } from "./internal/common/Card";
import { renderCommands } from "./internal/page/PageSurface.commands";
import { renderEmpty, renderPageModals, renderSectionStack, renderToolbar } from "./internal/page/PageSurface.sections";
import type {
  PageSurfaceCompleteBodySpec,
  PageSurfaceDirectoryProps,
  PageSurfaceEmptySpec,
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
  PageSurfaceBodySectionSpec,
  PageSurfaceSectionHeaderSpec,
  PageSurfaceSectioningSpec,
  PageSurfaceSectionSpec,
  PageSurfaceSplitBodySpec,
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
    <NavigationRenderer
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
      {renderPageModals(bodySpec.modals)}
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

function paneBlocks(split: PageSurfaceSplitBodySpec, mode: SplitWorkspaceMode) {
  const selector = mode === "drawer" ? split.drawerSelector ?? split.selector : split.selector;
  return <SelectorSurface {...selector} />;
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
        renderSide={(mode) => paneBlocks(split, mode)}
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
  const withoutBase = workspaceBasePath && pathname.startsWith(workspaceBasePath)
    ? pathname.slice(workspaceBasePath.length)
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
    if (section.body.kind === "section" && section.body.sections) return hasSectionKind(section.body.sections, predicate);
    return false;
  });
}

function hasLoginForm(body?: PageSurfaceProps["body"]) {
  const bodySpec = completeBody(body);
  return hasSectionKind(
    bodySpec.sections,
    (section) => section.body.kind === "form" && section.body.form.kind === "login",
  );
}

function findLoginContent(sections?: PageSurfaceSectionSpec[]): ReactNode | undefined {
  if (!sections?.length) return undefined;
  for (const section of sections) {
    if (section.body.kind === "section" && section.body.surface?.kind === "content") return section.body.surface.content;
    if (section.body.kind === "section" && section.body.sections) {
      const content = findLoginContent(section.body.sections);
      if (content !== undefined) return content;
    }
  }
  return undefined;
}

function hasDirectoryContent(body?: PageSurfaceProps["body"]) {
  const bodySpec = completeBody(body);
  if (bodySpec.empty) return true;
  return hasSectionKind(
    bodySpec.sections,
    (section) => section.body.kind === "section" && (section.body.surface?.kind === "moduleGrid" || section.body.surface?.kind === "empty"),
  );
}

function assertPageSurfaceKind(props: PageSurfaceProps) {
  const kind = props.kind ?? "standard";
  const segments = routeSegments();

  if (kind === "login") {
    if (props.body?.kind === "split") throw new Error("PageSurface kind=\"login\" cannot use split body.");
    if (props.navigation) throw new Error("PageSurface kind=\"login\" cannot declare navigation.");
    if (!hasLoginForm(props.body)) throw new Error("PageSurface kind=\"login\" must contain a login FormSurface.");
    if (findLoginContent(completeBody(props.body).sections) === undefined) throw new Error("PageSurface kind=\"login\" must contain a content block.");
    if (segments && segments[0] !== "login") throw new Error("PageSurface kind=\"login\" can only be used on the login route.");
    return;
  }

  if (kind === "directory") {
    if (props.body?.kind === "split") throw new Error("PageSurface kind=\"directory\" cannot use split body.");
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

function renderDirectoryEmpty(empty?: PageSurfaceEmptySpec, key?: string) {
  if (!empty) return null;
  if (empty.presentation === "plain") return <div key={key} className="text-center text-sm text-slate-500">{empty.content}</div>;
  return <EmptyStateCard key={key} compact={empty.compact}>{empty.content}</EmptyStateCard>;
}

function renderDirectorySection(section: PageSurfaceSectionSpec): ReactNode {
  if (section.body.kind === "section" && section.body.surface) {
    if (section.body.surface.kind === "empty") return renderDirectoryEmpty(section.body.surface, section.key);
    if (section.body.surface.kind !== "moduleGrid") return null;
    const grid = section.body.surface;
    return (
      <div key={section.key} className="flex w-full flex-col items-center justify-center">
        {(grid.leading || grid.title || grid.summary) && (
          <div className="mb-8 flex flex-col items-center">
            {grid.leading}
            {grid.title ? <h1 className="mt-4 text-2xl font-bold text-gray-800">{grid.title}</h1> : null}
            {grid.summary ? <p className="mt-1 text-center text-sm text-gray-500">{grid.summary}</p> : null}
          </div>
        )}
        <div className="grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {grid.items.map((item) => {
            const { key, ...props } = item;
            return <ModuleCard key={key} {...props} />;
          })}
        </div>
        {grid.afterGrid ? <div className="mt-8 w-full max-w-4xl">{grid.afterGrid}</div> : null}
      </div>
    );
  }
  if (section.body.kind === "section" && section.body.sections) {
    return (
      <div key={section.key} className="space-y-5">
        {section.header?.title ? <h1 className="text-center text-2xl font-bold text-gray-800">{section.header.title}</h1> : null}
        {section.header?.subtitle ? <p className="text-center text-sm text-gray-500">{section.header.subtitle}</p> : null}
        <div className={section.body.layout === "grid" ? "grid gap-4 lg:grid-cols-2" : "space-y-5"}>
          {section.body.sections.map(renderDirectorySection)}
        </div>
      </div>
    );
  }
  return null;
}

function renderDirectorySurface(props: PageSurfaceDirectoryProps) {
  const bodySpec = completeBody(props.body);
  const sections = bodySpec.sections?.map(renderDirectorySection);
  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <div className="space-y-5">{sections?.length ? sections : renderDirectoryEmpty(bodySpec.empty)}</div>
    </main>
  );
}

function renderLoginBody(props: PageSurfaceProps) {
  const bodySpec = completeBody(props.body);
  const content = findLoginContent(bodySpec.sections);
  return <main className="grid min-h-screen place-items-center px-4 py-6">{content}</main>;
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
        renderSide={(mode) => paneBlocks(split, mode)}
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
