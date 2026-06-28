"use client";

import type { ReactNode } from "react";
import {
  createPageBody, createBlockSurfaceBlock,
  createPanelBlock,
  PageSurface,
  type PageSurfaceBlockSpec,
  type PageSurfaceSideSpec,
} from "@workspace/core/ui";
import type { RosterSurfaceNavigationProps } from "../../roster-surface";
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
  blocks,
  surface,
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
  blocks: PageSurfaceBlockSpec[];
  surface?: RosterSurfaceNavigationProps;
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
        kind: "form",
        key: "tabs",
        surface: {
          kind: "inline",
          className: "mt-3",
          fields: [{
            key: "archived-type",
            label: "归档类型",
            spec: {
              valueType: "string",
              control: "choice",
              options: {
                source: "static",
                items: [
                  { value: "departments", label: `归档部门 ${archivedDepartments.length}` },
                  { value: "positions", label: `归档岗位 ${archivedPositions.length}` },
                ],
              },
            },
            value: archivedTab,
            onChange: (value) => onArchivedTabChange(String(value || "departments") as ArchivedEntityTab),
          }],
        },
      },
    ];

    blocks.push(archivedItems.length === 0
      ? createBlockSurfaceBlock("empty", {
        kind: "empty",
        presentation: "plain",
        compact: true,
        className: "mt-3",
        content: archivedTab === "departments" ? "暂无归档部门" : "暂无归档岗位"
      })
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

    return [createPanelBlock(`archive-side-${mode}`, {
      className: mode === "drawer" ? "h-full overflow-hidden" : undefined,
      bodyClassName: "p-3",
      blocks,
    })];
  }

  const side: PageSurfaceSideSpec = {
    blocks: sideBlocks("desktop"),
    drawerBlocks: sideBlocks("drawer"),
  };

  return (
    <PageSurface
      embedded={!surface}
      kind="split"
      {...surface}
      sideOpen={sideOpen}
      sideLabel="列表"
      onSideOpenChange={onSideOpenChange}
      drawerOpen={drawerOpen}
      onDrawerOpenChange={onDrawerOpenChange}
      showSideControls={false}
      side={side}
      body={createPageBody(blocks)}
    />
  );
}
