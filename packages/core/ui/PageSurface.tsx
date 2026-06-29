"use client";

import type { ReactNode } from "react";
import { workspaceBasePath } from "@workspace/core/routing";
import BodySurface, { renderBodyEmpty, type BodySurfaceEmptySpec, type BodySurfaceProps, type BodySurfaceSectionSpec } from "./BodySurface";
import { DatabasePageFrame } from "./internal/page/PageFrames";
import NavigationRenderer from "./NavigationRenderer";
import Pagination from "./internal/common/Pagination";
import type { TabDef } from "./internal/common/TabBar";
import { EmptyStateCard, ModuleCard } from "./internal/common/Card";
import { Toolbar } from "./Toolbar";
import type {
  PageSurfaceDirectoryProps,
  PageSurfaceNavigationItemSpec,
  PageSurfaceNavigationSpec,
  PageSurfaceProps,
  PageSurfaceToolbarSpec,
} from "./PageSurface.types";

export type {
  PageSurfaceBodySpec,
  PageSurfaceFooterSpec,
  PageSurfaceKind,
  PageSurfaceDirectoryProps,
  PageSurfaceLoginProps,
  PageSurfaceNavigationItemSpec,
  PageSurfaceNavigationSpec,
  PageSurfaceProps,
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

function renderToolbar(toolbar?: PageSurfaceToolbarSpec) {
  if (!toolbar?.items.length) return null;
  return <Toolbar {...toolbar} />;
}

function renderPageFrame(_props: PageSurfaceProps, frame: ReactNode) {
  return frame;
}

function renderPageToolbar(props: PageSurfaceProps) {
  if (props.toolbar?.hidden) return null;
  return renderToolbar(props.toolbar);
}

function renderEmbeddedSurfaceBody(props: PageSurfaceProps) {
  return (
    <div className="space-y-5">
      {renderNavigation(props.navigation)}
      {renderPageToolbar(props)}
      {props.body ? <BodySurface {...props.body} /> : null}
      {renderFooter(props.footer)}
    </div>
  );
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

function visitBodySurface(body: BodySurfaceProps | undefined, visitor: (body: BodySurfaceProps) => boolean): boolean {
  if (!body) return false;
  if (visitor(body)) return true;
  if (body.kind !== "section") return false;
  if (body.layout === "split") {
    return visitBodySurface(body.left, visitor)
      || visitBodySurface(body.drawerLeft, visitor)
      || visitBodySurface(body.right, visitor);
  }
  return Boolean(body.sections?.some((section) => visitBodySurface(section.body, visitor)));
}

function hasLoginForm(body?: BodySurfaceProps) {
  return visitBodySurface(body, (node) => node.kind === "form" && node.form.kind === "login");
}

function hasSplitBody(body?: BodySurfaceProps) {
  return visitBodySurface(body, (node) => node.kind === "section" && node.layout === "split");
}

function findLoginForm(body?: BodySurfaceProps): BodySurfaceProps | undefined {
  if (!body) return undefined;
  if (body.kind === "form" && body.form.kind === "login") return body;
  if (body.kind === "section") {
    if (body.layout === "split") return findLoginForm(body.right) ?? findLoginForm(body.left) ?? findLoginForm(body.drawerLeft);
    for (const section of body.sections ?? []) {
      const form = findLoginForm(section.body);
      if (form) return form;
    }
  }
  return undefined;
}

function hasDirectoryContent(body?: BodySurfaceProps) {
  return visitBodySurface(body, (node) => (
    node.kind === "section"
      && (Boolean(node.empty) || Boolean(node.moduleGrid))
  ));
}

function assertPageSurfaceKind(props: PageSurfaceProps) {
  const kind = props.kind ?? "standard";
  const segments = routeSegments();

  if (kind === "login") {
    if (hasSplitBody(props.body)) throw new Error("PageSurface kind=\"login\" cannot use split body.");
    if (props.navigation) throw new Error("PageSurface kind=\"login\" cannot declare navigation.");
    if (!hasLoginForm(props.body)) throw new Error("PageSurface kind=\"login\" must contain a login FormSurface.");
    if (segments && segments[0] !== "login") throw new Error("PageSurface kind=\"login\" can only be used on the login route.");
    return;
  }

  if (kind === "directory") {
    if (hasSplitBody(props.body)) throw new Error("PageSurface kind=\"directory\" cannot use split body.");
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

function renderDirectoryEmpty(empty?: BodySurfaceEmptySpec, key?: string) {
  if (!empty) return null;
  if (empty.presentation === "plain") return <div key={key} className="text-center text-sm text-slate-500">{empty.content}</div>;
  return <EmptyStateCard key={key} compact={empty.compact}>{empty.content}</EmptyStateCard>;
}

function renderDirectorySection(section: BodySurfaceSectionSpec): ReactNode {
  return renderDirectoryBody(section.body, section);
}

function renderDirectoryBody(body: BodySurfaceProps | undefined, section?: BodySurfaceSectionSpec): ReactNode {
  if (!body || body.kind !== "section" || body.layout === "split") return null;
  if (body.empty) return renderDirectoryEmpty(body.empty, section?.key);
  if (body.moduleGrid) {
    const grid = body.moduleGrid;
    return (
      <div key={section?.key} className="flex w-full flex-col items-center justify-center">
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
  if (body.sections?.length) {
    return (
      <div key={section?.key} className="space-y-5">
        {section?.header?.title ? <h1 className="text-center text-2xl font-bold text-gray-800">{section.header.title}</h1> : null}
        {section?.header?.subtitle ? <p className="text-center text-sm text-gray-500">{section.header.subtitle}</p> : null}
        <div className={body.layout === "grid" ? "grid gap-4 lg:grid-cols-2" : "space-y-5"}>
          {body.sections.map(renderDirectorySection)}
        </div>
      </div>
    );
  }
  return renderBodyEmpty(body.empty);
}

function renderDirectorySurface(props: PageSurfaceDirectoryProps) {
  const content = renderDirectoryBody(props.body);
  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <div className="space-y-5">{content}</div>
    </main>
  );
}

function renderLoginBody(props: PageSurfaceProps) {
  const form = findLoginForm(props.body);
  return (
    <main className="grid min-h-screen place-items-center px-4 py-6">
      <div className="mx-auto w-full max-w-[480px] rounded-lg border border-slate-200 bg-white px-8 py-8 shadow-sm">
        <div className="mx-auto w-full max-w-[360px]">
          {form ? <BodySurface {...form} /> : null}
        </div>
      </div>
    </main>
  );
}

export default function PageSurface(props: PageSurfaceProps) {
  assertPageSurfaceKind(props);
  if (props.kind === "login") {
    return renderLoginBody(props);
  }

  if (props.kind === "directory") {
    return renderDirectorySurface(props);
  }

  const tabsNavigation = props.navigation?.kind === "tabs" ? props.navigation : undefined;
  if (props.embedded) return renderEmbeddedSurfaceBody(props);
  return renderPageFrame(props, (
    <DatabasePageFrame
      tabs={tabsNavigation?.items.map(toTabDef)}
      activeTab={tabsNavigation?.active}
      activeChild={tabsNavigation?.activeChild}
      onTabChange={tabsNavigation?.onChange}
      onChildChange={tabsNavigation?.onChildChange}
      toolbar={renderPageToolbar(props)}
      footer={renderFooter(props.footer)}
    >
      {props.body ? <BodySurface {...props.body} /> : null}
    </DatabasePageFrame>
  ));
}
