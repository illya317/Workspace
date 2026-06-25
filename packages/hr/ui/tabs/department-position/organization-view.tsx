"use client";

import type { ReactNode } from "react";
import {
  Badge,
  EmptyStateCard,
  PanelCard,
  WorkspaceSplitPage,
} from "@workspace/core/ui";
import type { Department } from "./types";

export function OrganizationView({
  drawerOpen,
  loading,
  error,
  activeOrganizationRoot,
  activeOrganizationChildren,
  visibleRootDepartmentCount,
  renderSide,
  renderOrganizationBranch,
  onDrawerOpenChange,
}: {
  drawerOpen: boolean;
  loading: boolean;
  error: string | null;
  activeOrganizationRoot: Department | null | undefined;
  activeOrganizationChildren: Department[];
  visibleRootDepartmentCount: number;
  renderSide: (mode: "desktop" | "drawer") => ReactNode;
  renderOrganizationBranch: (department: Department, level?: number) => ReactNode;
  onDrawerOpenChange: (open: boolean) => void;
}) {
  return (
    <WorkspaceSplitPage
      sideOpen={true}
      sideLabel="一级部门"
      onSideOpenChange={() => undefined}
      drawerOpen={drawerOpen}
      onDrawerOpenChange={onDrawerOpenChange}
      showSideControls={false}
      renderSide={renderSide}
    >
      <PanelCard className="min-h-[520px]" bodyClassName="p-4">
        {loading && <EmptyStateCard compact>加载中...</EmptyStateCard>}
        {error && <EmptyStateCard compact className="border-red-100 bg-red-50 text-red-600">{error}</EmptyStateCard>}
        {!loading && !error && !activeOrganizationRoot && (
          <EmptyStateCard>
            {visibleRootDepartmentCount === 0 ? "暂无部门" : "请选择左侧一级部门"}
          </EmptyStateCard>
        )}
        {!loading && !error && activeOrganizationRoot && (
          <>
            <div className="mb-4 flex min-w-0 items-start justify-between gap-3 border-b border-slate-200 pb-4">
              <div className="min-w-0">
                <div className="flex min-w-0 items-baseline gap-3">
                  <div className="truncate text-lg font-semibold text-slate-900">{activeOrganizationRoot.name}</div>
                  <span className="shrink-0 font-mono text-sm text-slate-400">{activeOrganizationRoot.code}</span>
                </div>
              </div>
              <Badge level={activeOrganizationRoot.level} className="shrink-0 px-2 py-0.5 font-semibold px-2.5 py-1" />
            </div>
            {activeOrganizationChildren.length > 0 ? (
              <div className="max-w-4xl">
                {activeOrganizationChildren.map((child) => renderOrganizationBranch(child, 1))}
              </div>
            ) : (
              <EmptyStateCard>暂无下级部门</EmptyStateCard>
            )}
          </>
        )}
      </PanelCard>
    </WorkspaceSplitPage>
  );
}
