"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import {
  PageSurface,
  type PageSurfaceBlockSpec,
  type PageSurfaceSideSpec,
} from "@workspace/core/ui";
import type { Department } from "./types";

function DepartmentLevelChip({ level }: { level: number }) {
  return <span className="inline-flex shrink-0 items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{`L${level}`}</span>;
}

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
  const [sideOpen, setSideOpen] = useState(true);
  const side: PageSurfaceSideSpec = {
    blocks: [{ kind: "moduleView", key: "desktop", view: renderSide("desktop") }],
    drawerBlocks: [{ kind: "moduleView", key: "drawer", view: renderSide("drawer") }],
  };
  const panelBlocks: PageSurfaceBlockSpec[] = [];

  if (loading) {
    panelBlocks.push({ kind: "message", key: "loading", content: "加载中...", tone: "muted" });
  }

  if (error) {
    panelBlocks.push({ kind: "message", key: "error", content: error, tone: "danger" });
  }

  if (!loading && !error && !activeOrganizationRoot) {
    panelBlocks.push({
      kind: "empty",
      key: "empty",
      presentation: "plain",
      content: visibleRootDepartmentCount === 0 ? "暂无部门" : "请选择左侧一级部门",
    });
  }

  if (!loading && !error && activeOrganizationRoot) {
    panelBlocks.push({
      kind: "moduleView",
      key: "organization-header",
      view: (
        <>
          <div className="mb-4 flex min-w-0 items-start justify-between gap-3 border-b border-slate-200 pb-4">
            <div className="min-w-0">
              <div className="flex min-w-0 items-baseline gap-3">
                <div className="truncate text-lg font-semibold text-slate-900">{activeOrganizationRoot.name}</div>
                <span className="shrink-0 font-mono text-sm text-slate-400">{activeOrganizationRoot.code}</span>
              </div>
            </div>
            <DepartmentLevelChip level={activeOrganizationRoot.level} />
          </div>
        </>
      ),
    });

    if (activeOrganizationChildren.length > 0) {
      panelBlocks.push({
        kind: "moduleView",
        key: "organization-children",
        view: (
          <div className="max-w-4xl">
            {activeOrganizationChildren.map((child) => renderOrganizationBranch(child, 1))}
          </div>
        ),
      });
    } else {
      panelBlocks.push({ kind: "empty", key: "empty-children", presentation: "plain", content: "暂无下级部门" });
    }
  }

  return (
    <PageSurface
      embedded
      kind="split"
      sideOpen={sideOpen}
      sideLabel="一级部门"
      onSideOpenChange={setSideOpen}
      drawerOpen={drawerOpen}
      onDrawerOpenChange={onDrawerOpenChange}
      side={side}
      blocks={[
        {
          kind: "panel",
          key: "organization",
          className: "min-h-[520px]",
          bodyClassName: "p-4",
          blocks: panelBlocks,
        },
      ]}
    />
  );
}
