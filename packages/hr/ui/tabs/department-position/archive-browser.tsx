"use client";

import type { ReactNode } from "react";
import {
  PageSurface,
  type PageSurfaceBlockSpec,
  type PageSurfaceSideSpec,
} from "@workspace/core/ui";
import type { ArchivedEntityTab, Department, Position, Selection } from "./types";
import { formatArchiveTime, shortPositionCode } from "./utils";

interface ArchivedEntityItem {
  id: string | number;
  title: ReactNode;
  code?: ReactNode;
  meta?: ReactNode;
}

export function ArchivedDepartmentPositionPage({
  archivedDepartments,
  archivedPositions,
  archivedTab,
  selection,
  sideOpen,
  drawerOpen,
  onArchivedTabChange,
  onSideOpenChange,
  onDrawerOpenChange,
  onSelect,
  children,
}: {
  archivedDepartments: Department[];
  archivedPositions: Position[];
  archivedTab: ArchivedEntityTab;
  selection: Selection;
  sideOpen: boolean;
  drawerOpen: boolean;
  onArchivedTabChange: (tab: ArchivedEntityTab) => void;
  onSideOpenChange: (open: boolean) => void;
  onDrawerOpenChange: (open: boolean) => void;
  onSelect: (selection: Selection) => void;
  children: ReactNode;
}) {
  const archivedItems: ArchivedEntityItem[] = archivedTab === "departments"
    ? archivedDepartments.map((department) => ({
      id: department.id,
      title: department.name,
      code: `${department.code} L${department.level}`,
      meta: `上级：${department.parentName || "-"} · 归档：${formatArchiveTime(department.archivedAt)}`,
    }))
    : archivedPositions.map((position) => ({
      id: position.id,
      title: position.name,
      code: shortPositionCode(position.code),
      meta: `部门：${position.departmentName || "-"} · 归档：${formatArchiveTime(position.archivedAt)}`,
    }));
  const activeItemId = archivedTab === "departments"
    ? selection?.type === "department" ? selection.id : null
    : selection?.type === "position" ? selection.id : null;

  function sideBlocks(mode: "desktop" | "drawer"): PageSurfaceBlockSpec[] {
    const blocks: PageSurfaceBlockSpec[] = [
      ...(mode === "drawer"
        ? [{
            kind: "form" as const,
            key: "close",
            surface: {
              kind: "inline" as const,
              className: "justify-end",
              actions: [{ key: "close", label: "关闭", onClick: () => onDrawerOpenChange(false) }],
            },
          }]
        : []),
      {
        kind: "navigation",
        key: "tabs",
        surface: {
          kind: "tabs",
          className: "mt-3",
          tabs: {
            variant: "micro",
            active: archivedTab,
            onChange: (tab) => onArchivedTabChange(tab as ArchivedEntityTab),
            tabs: [
              { key: "departments", label: <>归档部门 <span className="ml-1 text-xs font-medium text-slate-400">{archivedDepartments.length}</span></> },
              { key: "positions", label: <>归档岗位 <span className="ml-1 text-xs font-medium text-slate-400">{archivedPositions.length}</span></> },
            ],
          },
        },
      },
    ];

    blocks.push(archivedItems.length === 0
      ? {
          kind: "empty",
          key: "empty",
          presentation: "plain",
          compact: true,
          className: "mt-3",
          content: archivedTab === "departments" ? "暂无归档部门" : "暂无归档岗位",
        }
      : {
          kind: "navigation",
          key: "list",
          surface: {
            kind: "selector",
            className: "mt-3 max-h-[620px] space-y-2 overflow-auto",
            selector: {
              framed: false,
              items: archivedItems,
              selectedId: activeItemId,
              onSelect: (item) => onSelect({
                type: archivedTab === "departments" ? "department" : "position",
                id: Number(item.id),
              }),
              getKey: (item) => item.id,
              renderItem: (item) => ({
                title: item.title,
                code: item.code,
                metaLine: item.meta,
              }),
              size: "sm",
            },
          },
        });

    return [{
      kind: "panel",
      key: `archive-side-${mode}`,
      className: mode === "drawer" ? "h-full overflow-hidden" : undefined,
      bodyClassName: "p-3",
      blocks,
    }];
  }

  const side: PageSurfaceSideSpec = {
    blocks: sideBlocks("desktop"),
    drawerBlocks: sideBlocks("drawer"),
  };

  return (
    <PageSurface
      embedded
      kind="split"
      sideOpen={sideOpen}
      sideLabel="列表"
      onSideOpenChange={onSideOpenChange}
      drawerOpen={drawerOpen}
      onDrawerOpenChange={onDrawerOpenChange}
      showSideControls={false}
      side={side}
      blocks={[{ kind: "moduleView", key: "content", view: children }]}
    />
  );
}
