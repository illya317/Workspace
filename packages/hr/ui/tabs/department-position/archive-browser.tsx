"use client";

import type { ReactNode } from "react";
import {
  createPageBody,
  PageSurface,
  type PageSurfaceSectionSpec,
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
  sections,
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
  sections: PageSurfaceSectionSpec[];
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

  return (
    <PageSurface kind="standard"
      embedded={!surface}
      {...surface}
      body={{
        kind: "split",
        selector: {
          kind: "list",
          title: "归档列表",
          commands: [
            {
              key: "departments",
              label: `归档部门 ${archivedDepartments.length}`,
              variant: archivedTab === "departments" ? "primary" : "secondary",
              onClick: () => onArchivedTabChange("departments"),
            },
            {
              key: "positions",
              label: `归档岗位 ${archivedPositions.length}`,
              variant: archivedTab === "positions" ? "primary" : "secondary",
              onClick: () => onArchivedTabChange("positions"),
            },
          ],
          items: archivedItems,
          selectedId: activeItemId,
          onSelect: (item: ArchivedEntityItem) => onSelect({
            type: archivedTab === "departments" ? "department" : "position",
            id: Number(item.id),
          }),
          getKey: (item: ArchivedEntityItem) => item.id,
          renderItem: (item: ArchivedEntityItem) => ({
            title: item.title,
            code: item.code,
            metaLine: item.meta,
          }),
          size: "sm",
          emptyText: archivedTab === "departments" ? "暂无归档部门" : "暂无归档岗位",
        },
        drawerSelector: {
          kind: "list",
          title: "归档列表",
          commands: [
            { key: "close", label: "关闭", onClick: () => onDrawerOpenChange(false) },
            {
              key: "departments",
              label: `归档部门 ${archivedDepartments.length}`,
              variant: archivedTab === "departments" ? "primary" : "secondary",
              onClick: () => onArchivedTabChange("departments"),
            },
            {
              key: "positions",
              label: `归档岗位 ${archivedPositions.length}`,
              variant: archivedTab === "positions" ? "primary" : "secondary",
              onClick: () => onArchivedTabChange("positions"),
            },
          ],
          items: archivedItems,
          selectedId: activeItemId,
          onSelect: (item: ArchivedEntityItem) => onSelect({
            type: archivedTab === "departments" ? "department" : "position",
            id: Number(item.id),
          }),
          getKey: (item: ArchivedEntityItem) => item.id,
          renderItem: (item: ArchivedEntityItem) => ({
            title: item.title,
            code: item.code,
            metaLine: item.meta,
          }),
          size: "sm",
          emptyText: archivedTab === "departments" ? "暂无归档部门" : "暂无归档岗位",
        },
        right: createPageBody(sections),
        sideOpen,
        sideLabel: "列表",
        onSideOpenChange,
        drawerOpen,
        onDrawerOpenChange,
        showSideControls: false,
      }}
    />
  );
}
