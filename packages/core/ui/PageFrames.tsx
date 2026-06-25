"use client";

import type { ReactNode } from "react";
import PageContent from "./PageContent";
import TabBar, { type TabDef } from "./TabBar";
import SplitWorkspace, { SplitWorkspaceToolbar, type SplitWorkspaceMode } from "./SplitWorkspace";
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
  return (
    <PageContent className={contentClassName}>
      <div className={joinClassNames("space-y-5", className)}>
        {header}
        <SplitWorkspaceToolbar
          sideOpen={sideOpen}
          sideLabel={sideLabel}
          onSideOpenChange={onSideOpenChange}
          onDrawerOpen={() => onDrawerOpenChange(true)}
          showSideControls={showSideControls}
        >
          {toolbar}
        </SplitWorkspaceToolbar>
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
