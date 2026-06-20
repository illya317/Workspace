"use client";

import type { ReactNode } from "react";
import PageContent from "./PageContent";
import SplitWorkspace, { SplitWorkspaceToolbar, type SplitWorkspaceMode } from "./SplitWorkspace";
import TabBar, { type TabDef } from "./TabBar";
import { joinClassNames } from "./card-utils";

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
        >
          {toolbar}
        </SplitWorkspaceToolbar>
        {beforeSplit}
        <SplitWorkspace
          sideOpen={sideOpen}
          drawerOpen={drawerOpen}
          onDrawerOpenChange={onDrawerOpenChange}
          renderSide={renderSide}
        >
          {children}
        </SplitWorkspace>
      </div>
    </PageContent>
  );
}

export interface DatabasePageFrameProps {
  tabs?: TabDef[];
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  toolbar?: ReactNode;
  summary?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function DatabasePageFrame({
  tabs,
  activeTab,
  onTabChange,
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
          <TabBar tabs={tabs} active={activeTab} onChange={onTabChange} />
        )}
        {summary}
        {toolbar}
        {children}
      </div>
    </PageContent>
  );
}

export interface AnalysisPageFrameProps {
  tabs?: TabDef[];
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  metrics?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function AnalysisPageFrame({
  tabs,
  activeTab,
  onTabChange,
  metrics,
  children,
  className = "",
  contentClassName = "",
}: AnalysisPageFrameProps) {
  return (
    <PageContent className={contentClassName}>
      <div className={joinClassNames("space-y-6", className)}>
        {tabs && activeTab && onTabChange && (
          <TabBar tabs={tabs} active={activeTab} onChange={onTabChange} />
        )}
        {metrics}
        {children}
      </div>
    </PageContent>
  );
}
