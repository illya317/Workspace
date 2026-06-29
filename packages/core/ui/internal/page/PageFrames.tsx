"use client";

import type { ReactNode } from "react";
import PageContent from "./PageContent";
import TabBar, { type TabDef } from "../common/TabBar";
import SplitWorkspace, { type SplitWorkspaceMode } from "../common/SplitWorkspace";
import { Toolbar, type ToolbarItem } from "../../Toolbar";
import { joinClassNames } from "../common/card-utils";

type PageFrameTab = TabDef;

function PageFrameTabs({
  tabs,
  activeTab,
  activeChild,
  onTabChange,
  onChildChange,
}: {
  tabs: PageFrameTab[];
  activeTab: string;
  activeChild?: string;
  onTabChange: (tab: string) => void;
  onChildChange?: (child: string) => void;
}) {
  return (
    <TabBar
      variant="large"
      accordion
      tabs={tabs}
      active={activeTab}
      activeChild={activeChild}
      onChange={onTabChange}
      onChildChange={onChildChange}
    />
  );
}

export interface WorkspaceSplitPageProps {
  tabs?: PageFrameTab[];
  activeTab?: string;
  activeChild?: string;
  onTabChange?: (tab: string) => void;
  onChildChange?: (child: string) => void;
  sideOpen: boolean;
  drawerOpen: boolean;
  onSideOpenChange: (open: boolean) => void;
  onDrawerOpenChange: (open: boolean) => void;
  sideLabel: string;
  renderSide: (mode: SplitWorkspaceMode) => ReactNode;
  children: ReactNode;
  header?: ReactNode;
  toolbarItems?: ToolbarItem[];
  beforeSplit?: ReactNode;
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
  showSideControls?: boolean;
  splitRatio?: readonly [number, number];
}

export function WorkspaceSplitPage({
  tabs,
  activeTab,
  activeChild,
  onTabChange,
  onChildChange,
  sideOpen,
  drawerOpen,
  onSideOpenChange,
  onDrawerOpenChange,
  sideLabel,
  renderSide,
  children,
  header,
  toolbarItems: providedToolbarItems,
  beforeSplit,
  footer,
  className = "",
  contentClassName = "",
  showSideControls = true,
  splitRatio,
}: WorkspaceSplitPageProps) {
  const toolbarItems: ToolbarItem[] = [];
  if (showSideControls) {
    toolbarItems.push({
      kind: "panel-toggle",
      key: "mobile-side-toggle",
      icon: "panel-open",
      label: `显示${sideLabel}`,
      onClick: () => onDrawerOpenChange(true),
      visibility: "mobile",
    });
    toolbarItems.push({
      kind: "panel-toggle",
      key: "desktop-side-toggle",
      icon: sideOpen ? "panel-open" : "panel-close",
      label: `${sideOpen ? "隐藏" : "显示"}${sideLabel}`,
      onClick: () => onSideOpenChange(!sideOpen),
      variant: sideOpen ? "primary" : "secondary",
      visibility: "desktop",
    });
  }
  if (providedToolbarItems) {
    toolbarItems.push(...providedToolbarItems);
  }

  return (
    <PageContent className={contentClassName}>
      <div className={joinClassNames("space-y-5", className)}>
        {tabs && activeTab && onTabChange && (
          <PageFrameTabs
            tabs={tabs}
            activeTab={activeTab}
            activeChild={activeChild}
            onTabChange={onTabChange}
            onChildChange={onChildChange}
          />
        )}
        {header}
        {toolbarItems.length > 0 && <Toolbar items={toolbarItems} />}
        {beforeSplit}
        <SplitWorkspace
          sideOpen={sideOpen}
          drawerOpen={drawerOpen}
          onDrawerOpenChange={onDrawerOpenChange}
          renderSide={renderSide}
          splitRatio={splitRatio}
        >
          {children}
        </SplitWorkspace>
        {footer}
      </div>
    </PageContent>
  );
}

export interface DatabasePageFrameProps {
  tabs?: PageFrameTab[];
  activeTab?: string;
  activeChild?: string;
  onTabChange?: (tab: string) => void;
  onChildChange?: (child: string) => void;
  toolbarItems?: ToolbarItem[];
  toolbar?: ReactNode;
  summary?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function DatabasePageFrame({
  tabs,
  activeTab,
  activeChild,
  onTabChange,
  onChildChange,
  toolbarItems,
  toolbar,
  summary,
  footer,
  children,
  className = "",
  contentClassName = "",
}: DatabasePageFrameProps) {
  return (
    <PageContent className={contentClassName}>
      <div className={joinClassNames("space-y-5", className)}>
        {tabs && activeTab && onTabChange && (
          <PageFrameTabs
            tabs={tabs}
            activeTab={activeTab}
            activeChild={activeChild}
            onTabChange={onTabChange}
            onChildChange={onChildChange}
          />
        )}
        {summary}
        {toolbar ?? (toolbarItems?.length ? <Toolbar items={toolbarItems} /> : null)}
        {children}
        {footer}
      </div>
    </PageContent>
  );
}

export interface AnalysisPageFrameProps {
  tabs?: PageFrameTab[];
  activeTab?: string;
  activeChild?: string;
  onTabChange?: (tab: string) => void;
  onChildChange?: (child: string) => void;
  summary?: ReactNode;
  metrics?: ReactNode;
  toolbar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function AnalysisPageFrame({
  tabs,
  activeTab,
  activeChild,
  onTabChange,
  onChildChange,
  summary,
  metrics,
  toolbar,
  footer,
  children,
  className = "",
  contentClassName = "",
}: AnalysisPageFrameProps) {
  return (
    <PageContent className={contentClassName}>
      <div className={joinClassNames("space-y-6", className)}>
        {tabs && activeTab && onTabChange && (
          <PageFrameTabs
            tabs={tabs}
            activeTab={activeTab}
            activeChild={activeChild}
            onTabChange={onTabChange}
            onChildChange={onChildChange}
          />
        )}
        {summary}
        {metrics}
        {toolbar}
        {children}
        {footer}
      </div>
    </PageContent>
  );
}
