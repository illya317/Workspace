"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { workspaceBasePath } from "@workspace/core/routing";
import BodySurface from "./BodySurface";
import {
  bodySurfaceHasDirectoryContent,
  bodySurfaceHasLoginForm,
  bodySurfaceHasSplit,
  bodySurfacePageToolbarItems,
  renderBodySurfaceAfterToolbar,
  renderBodySurfaceDirectory,
  renderBodySurfaceLoginForm,
} from "./internal/body/BodySurfacePageIntegration";
import { DatabasePageFrame } from "./internal/page/PageFrames";
import { BodySurfaceSplitProvider } from "./internal/body/BodySurfaceSplitContext";
import NavigationSurface from "./NavigationSurface";
import Pagination from "./internal/common/Pagination";
import { Toolbar } from "./Toolbar";
import { PAGE_SURFACE_STACK_CLASS } from "./internal/page/PageSurface.spacing";
import { usePageAssistant, type PageAssistantOpenInput } from "./services/PageAssistantProvider";
import type {
  PageSurfaceDirectoryProps,
  PageSurfaceTabBarSpec,
  PageSurfaceProps,
  PageSurfaceToolbarSpec,
} from "./PageSurface.types";

type PageAssistantDefault = false | Pick<PageAssistantOpenInput, "contextLabel" | "sourceContext">;

export type {
  PageSurfaceBodySpec,
  PageSurfaceFooterSpec,
  PageSurfaceKind,
  PageSurfaceLoginBrandSpec,
  PageSurfaceDirectoryProps,
  PageSurfaceLoginProps,
  PageSurfaceTabBarItemSpec,
  PageSurfaceTabBarSpec,
  PageSurfaceProps,
  PageSurfaceStandardProps,
  PageSurfaceToolbarSpec,
} from "./PageSurface.types";

function renderTabBar(tabbar?: PageSurfaceTabBarSpec) {
  if (!tabbar) return null;
  return <NavigationSurface {...tabbar} />;
}

function renderFooter(footer?: PageSurfaceProps["footer"]) {
  if (!footer || footer.hidden) return null;
  if (footer.pagination) {
    return <div><Pagination {...footer.pagination} /></div>;
  }
  return null;
}

function tabbarContextLabel(tabbar?: PageSurfaceTabBarSpec) {
  if (!tabbar) return undefined;
  const { active, activeChild } = tabbarActiveItems(tabbar);
  return [tabbar.label, active?.label, activeChild?.label]
    .filter(Boolean)
    .join(" / ") || undefined;
}

function tabbarActiveItems(tabbar?: PageSurfaceTabBarSpec) {
  const active = tabbar?.items.find((item) => item.key === tabbar.active);
  const activeChild = active?.children?.find((item) => item.key === tabbar?.activeChild);
  return { active, activeChild };
}

function tabbarSourceContext(tabbar?: PageSurfaceTabBarSpec): PageAssistantOpenInput["sourceContext"] {
  if (!tabbar) return undefined;
  const { active, activeChild } = tabbarActiveItems(tabbar);
  return {
    navigationLabel: tabbar.label,
    activeKey: active?.key,
    activeLabel: active?.label,
    activeChildKey: activeChild?.key,
    activeChildLabel: activeChild?.label,
  };
}

function renderToolbar(toolbar?: PageSurfaceToolbarSpec, defaultAssistant?: PageAssistantDefault) {
  if (!toolbar?.items.length) return null;
  return <Toolbar {...toolbar} defaultAssistant={defaultAssistant} />;
}

function defaultAssistantForPage(props: PageSurfaceProps) {
  if (props.kind === "login" || props.kind === "directory") return false;
  if (props.toolbar?.assistant === false) return false;
  return {
    contextLabel: tabbarContextLabel(props.tabbar),
    sourceContext: tabbarSourceContext(props.tabbar),
  };
}

function renderPageToolbar(
  props: PageSurfaceProps,
  splitRuntime: { open: boolean; onOpenChange: (open: boolean) => void } | null,
) {
  if (props.toolbar?.hidden) return null;
  const derivedCreateItems = bodySurfacePageToolbarItems(props.body, splitRuntime);
  const derivedKeys = new Set(derivedCreateItems.map((item) => item.key));
  const declaredItems = (props.toolbar?.items ?? []).filter((item) => !derivedKeys.has(item.key));
  const items = [...derivedCreateItems, ...declaredItems];
  if (!items.length) return null;
  return renderToolbar({ ...props.toolbar, items }, defaultAssistantForPage(props));
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

function assertPageSurfaceKind(props: PageSurfaceProps) {
  const kind = props.kind ?? "standard";
  const segments = routeSegments();

  if (kind === "login") {
    if (bodySurfaceHasSplit(props.body)) throw new Error("PageSurface kind=\"login\" cannot use split body.");
    if ("tabbar" in props && props.tabbar) throw new Error("PageSurface kind=\"login\" cannot declare tabbar.");
    if (!bodySurfaceHasLoginForm(props.body)) throw new Error("PageSurface kind=\"login\" must contain a login FormSurface.");
    if (segments && segments[0] !== "login") throw new Error("PageSurface kind=\"login\" can only be used on the login route.");
    return;
  }

  if (kind === "directory") {
    if (bodySurfaceHasSplit(props.body)) throw new Error("PageSurface kind=\"directory\" cannot use split body.");
    if ("tabbar" in props && props.tabbar) throw new Error("PageSurface kind=\"directory\" cannot declare tabbar.");
    if (props.toolbar) throw new Error("PageSurface kind=\"directory\" cannot declare toolbar.");
    if (!bodySurfaceHasDirectoryContent(props.body)) throw new Error("PageSurface kind=\"directory\" must contain module entries or an empty directory state.");
    if (segments) {
      const isPortalDirectory = (segments.length === 1 && segments[0] === "portal")
        || (segments.length === 2 && segments[0] === "workspace" && segments[1] === "portal");
      const isResourceDirectory = segments.length >= 1 && segments.length <= 2 && segments[0] !== "login" && segments[0] !== "portal";
      if (!isPortalDirectory && !isResourceDirectory) {
        throw new Error("PageSurface kind=\"directory\" can only be used on portal or L1/L2 resource routes.");
      }
    }
    return;
  }

}

function renderDirectorySurface(props: PageSurfaceDirectoryProps) {
  const content = renderBodySurfaceDirectory(props.body);
  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <div className={PAGE_SURFACE_STACK_CLASS}>{content}</div>
    </main>
  );
}

function renderLoginBody(props: PageSurfaceProps) {
  if (props.kind !== "login") return null;
  return (
    <main className="grid min-h-screen place-items-center px-4 py-6">
      <div className="mx-auto w-full max-w-[480px] rounded-2xl border border-slate-200 bg-white px-5 py-6 shadow-sm sm:rounded-lg sm:px-8 sm:py-8">
        <div className="mx-auto w-full max-w-[360px]">
          <div className="mb-6 text-center">
            {props.brand.logo ? (
              <Image
                src={props.brand.logo.src}
                alt={props.brand.logo.alt}
                width={props.brand.logo.width}
                height={props.brand.logo.height}
                priority
                className="mx-auto h-auto w-auto max-w-[240px] object-contain"
              />
            ) : null}
            <h1 className="mt-4 text-2xl font-bold text-slate-900">{props.brand.title}</h1>
          </div>
          {renderBodySurfaceLoginForm(props.body)}
        </div>
      </div>
    </main>
  );
}

export default function PageSurface(props: PageSurfaceProps) {
  const [splitOpen, setSplitOpen] = useState(true);
  const hasSplit = bodySurfaceHasSplit(props.body);
  const splitRuntime = useMemo(
    () => hasSplit ? { open: splitOpen, onOpenChange: setSplitOpen } : null,
    [hasSplit, splitOpen],
  );
  const { enabled: pageAssistantEnabled, setCurrentContext: setPageAssistantCurrentContext } = usePageAssistant();
  const pageAssistantDefault = defaultAssistantForPage(props);
  const pageAssistantEnabledForPage = Boolean(pageAssistantDefault);
  const pageAssistantContextLabel = pageAssistantDefault ? pageAssistantDefault.contextLabel : undefined;
  const pageAssistantSourceContext = pageAssistantDefault ? pageAssistantDefault.sourceContext : undefined;
  const pageAssistantNavigationLabel = pageAssistantSourceContext?.navigationLabel;
  const pageAssistantActiveKey = pageAssistantSourceContext?.activeKey;
  const pageAssistantActiveLabel = pageAssistantSourceContext?.activeLabel;
  const pageAssistantActiveChildKey = pageAssistantSourceContext?.activeChildKey;
  const pageAssistantActiveChildLabel = pageAssistantSourceContext?.activeChildLabel;

  useEffect(() => {
    if (!pageAssistantEnabled || !pageAssistantEnabledForPage) return;
    setPageAssistantCurrentContext({
      contextLabel: pageAssistantContextLabel,
      path: typeof window === "undefined" ? undefined : window.location.pathname,
      title: typeof document === "undefined" ? undefined : document.title,
      sourceContext: {
        navigationLabel: pageAssistantNavigationLabel,
        activeKey: pageAssistantActiveKey,
        activeLabel: pageAssistantActiveLabel,
        activeChildKey: pageAssistantActiveChildKey,
        activeChildLabel: pageAssistantActiveChildLabel,
      },
    });
  }, [
    pageAssistantActiveChildKey,
    pageAssistantActiveChildLabel,
    pageAssistantActiveKey,
    pageAssistantActiveLabel,
    pageAssistantContextLabel,
    pageAssistantEnabled,
    pageAssistantEnabledForPage,
    pageAssistantNavigationLabel,
    setPageAssistantCurrentContext,
  ]);

  assertPageSurfaceKind(props);
  if (props.kind === "login") {
    return renderLoginBody(props);
  }

  if (props.kind === "directory") {
    return renderDirectorySurface(props);
  }

  return (
    <BodySurfaceSplitProvider runtime={splitRuntime}>
      <DatabasePageFrame
        navigation={renderTabBar(props.tabbar)}
        toolbar={renderPageToolbar(props, splitRuntime)}
        afterToolbar={renderBodySurfaceAfterToolbar(props.body)}
        footer={renderFooter(props.footer)}
      >
        {props.body ? <BodySurface {...props.body} /> : null}
      </DatabasePageFrame>
    </BodySurfaceSplitProvider>
  );
}
