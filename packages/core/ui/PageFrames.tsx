"use client";

import type { ReactNode } from "react";
import { ActionButton } from "./ActionControls";
import PageContent from "./PageContent";
import TabBar, { type TabDef } from "./TabBar";
import SplitWorkspace, { type SplitWorkspaceMode } from "./SplitWorkspace";
import { Toolbar, type ToolbarItem } from "./Toolbar";
import { joinClassNames } from "./card-utils";

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
  sideOpen: boolean;
  drawerOpen: boolean;
  onSideOpenChange: (open: boolean) => void;
  onDrawerOpenChange: (open: boolean) => void;
  sideLabel: string;
  renderSide: (mode: SplitWorkspaceMode) => ReactNode;
  children: ReactNode;
  header?: ReactNode;
  toolbar?: ReactNode;
  beforeSplit?: ReactNode;
  className?: string;
  contentClassName?: string;
  showSideControls?: boolean;
  splitRatio?: readonly [number, number];
}

export function WorkspaceSplitPage({
  sideOpen,
  drawerOpen,
  onSideOpenChange,
  onDrawerOpenChange,
  sideLabel,
  renderSide,
  children,
  header,
  toolbar,
  beforeSplit,
  className = "",
  contentClassName = "",
  showSideControls = true,
  splitRatio,
}: WorkspaceSplitPageProps) {
  const toolbarItems: ToolbarItem[] = [];
  if (showSideControls) {
    toolbarItems.push({
      kind: "custom",
      key: "mobile-side-toggle",
      section: "view",
      content: (
        <span className="lg:hidden">
          <ActionButton
            kind="panel-open"
            label={`显示${sideLabel}`}
            onClick={() => onDrawerOpenChange(true)}
            className="!h-9 !w-10 !px-0"
          />
        </span>
      ),
    });
    toolbarItems.push({
      kind: "custom",
      key: "desktop-side-toggle",
      section: "view",
      content: (
        <span className="hidden lg:block">
          <ActionButton
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
  if (toolbar) {
    toolbarItems.push({ kind: "custom", key: "toolbar", section: "edit", content: toolbar });
  }

  return (
    <PageContent className={contentClassName}>
      <div className={joinClassNames("space-y-5", className)}>
        {header}
        {toolbarItems.length > 0 && (
          <Toolbar items={toolbarItems} variant="inline" className="w-full justify-start" />
        )}
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
  toolbar?: ReactNode;
  summary?: ReactNode;
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
  toolbar,
  summary,
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
        {toolbar}
        {children}
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
  metrics?: ReactNode;
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
  metrics,
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
        {metrics}
        {children}
      </div>
    </PageContent>
  );
}
