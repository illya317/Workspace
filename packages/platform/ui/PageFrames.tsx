"use client";

import type { ReactNode } from "react";
import {
  ModuleGridPage,
  PageContent,
  SplitWorkspace,
  SplitWorkspaceToolbar,
  TabBar,
  type ModuleGridPageProps,
  type SplitWorkspaceMode,
  type TabDef,
} from "@workspace/core/ui";

function joinClassNames(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

export { ModuleGridPage };
export type { ModuleGridPageProps };

export interface WorkspaceSplitPageProps {
  sideOpen: boolean;
  drawerOpen: boolean;
  onSideOpenChange: (open: boolean) => void;
  onDrawerOpenChange: (open: boolean) => void;
  sideLabel: string;
  renderSide: (mode: SplitWorkspaceMode) => ReactNode;
  children: ReactNode;
  toolbar?: ReactNode;
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
  toolbar,
  className = "",
  contentClassName = "",
}: WorkspaceSplitPageProps) {
  return (
    <PageContent className={contentClassName}>
      <div className={joinClassNames("space-y-5", className)}>
        <SplitWorkspaceToolbar
          sideOpen={sideOpen}
          sideLabel={sideLabel}
          onSideOpenChange={onSideOpenChange}
          onDrawerOpen={() => onDrawerOpenChange(true)}
        >
          {toolbar}
        </SplitWorkspaceToolbar>
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
