"use client";

import {
  createPageBody,
  PageSurface,
  type BodySurfaceProps,
  type BodySurfaceSectionSpec,
  type PageSurfaceStandardProps,
} from "@workspace/core/ui";
import type { RosterSurfaceTabBarProps } from "../../roster-surface";
import { rosterAssistantToolbarItems } from "../../roster-surface";
import type { ArchivedEntityTab, Department, Position, Selection } from "./types";
import { formatArchiveTime, shortPositionCode } from "./utils";

interface ArchivedEntityItem {
  id: string | number;
  title: string;
  code?: string | number;
  meta?: string;
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
  sections: BodySurfaceSectionSpec[];
  surface?: RosterSurfaceTabBarProps;
}) {
  const archivedItems: ArchivedEntityItem[] = archivedTab === "departments"
    ? archivedDepartments.map((department) => ({
      id: department.id,
      title: department.name,
      code: department.code,
      meta: `上级：${department.parentName || "-"} · 归档：${formatArchiveTime(department.archivedAt)}`,
    }))
    : archivedPositions.map((position) => ({
      id: position.id,
      title: position.name,
      code: shortPositionCode(position.code),
      meta: `组织：${position.departmentName || "-"} · 归档：${formatArchiveTime(position.archivedAt)}`,
    }));
  const activeItemId = archivedTab === "departments"
    ? selection?.type === "department" ? selection.id : null
    : selection?.type === "position" ? selection.id : null;
  const toolbarItems = rosterAssistantToolbarItems(surface);
  const body: BodySurfaceProps = {
        kind: "section",
        layout: "split",
        left: {
          kind: "selector",
          selector: {
            kind: "list",
            title: "归档列表",
            commands: [
              {
                key: "departments",
                label: `归档组织 ${archivedDepartments.length}`,
                icon: "list",
                variant: archivedTab === "departments" ? "primary" : "secondary",
                onClick: () => onArchivedTabChange("departments"),
              },
              {
                key: "positions",
                label: `归档岗位 ${archivedPositions.length}`,
                icon: "archive",
                variant: archivedTab === "positions" ? "primary" : "secondary",
                onClick: () => onArchivedTabChange("positions"),
              },
            ],
            items: archivedItems.map((item) => ({
              key: item.id,
              value: item,
              card: { title: item.title, code: item.code, metaLine: item.meta },
            })),
            selectedId: activeItemId,
            onSelect: (item: ArchivedEntityItem) => onSelect({
              type: archivedTab === "departments" ? "department" : "position",
              id: Number(item.id),
            }),
            size: "sm",
            emptyText: archivedTab === "departments" ? "暂无归档组织" : "暂无归档岗位",
          },
        },
        drawerLeft: {
          kind: "selector",
          selector: {
            kind: "list",
            title: "归档列表",
            commands: [
              { key: "close", label: "关闭", icon: "panel-close", onClick: () => onDrawerOpenChange(false) },
              {
                key: "departments",
                label: `归档组织 ${archivedDepartments.length}`,
                icon: "list",
                variant: archivedTab === "departments" ? "primary" : "secondary",
                onClick: () => onArchivedTabChange("departments"),
              },
              {
                key: "positions",
                label: `归档岗位 ${archivedPositions.length}`,
                icon: "archive",
                variant: archivedTab === "positions" ? "primary" : "secondary",
                onClick: () => onArchivedTabChange("positions"),
              },
            ],
            items: archivedItems.map((item) => ({
              key: item.id,
              value: item,
              card: { title: item.title, code: item.code, metaLine: item.meta },
            })),
            selectedId: activeItemId,
            onSelect: (item: ArchivedEntityItem) => onSelect({
              type: archivedTab === "departments" ? "department" : "position",
              id: Number(item.id),
            }),
            size: "sm",
            emptyText: archivedTab === "departments" ? "暂无归档组织" : "暂无归档岗位",
          },
        },
        right: createPageBody(sections),
        sideOpen,
        sideLabel: "列表",
        onSideOpenChange,
        drawerOpen,
        onDrawerOpenChange,
        showSideControls: false,
  };
  const pageProps: PageSurfaceStandardProps = surface
    ? { ...surface, toolbar: toolbarItems.length ? { items: toolbarItems } : undefined, body }
    : { body };
  return <PageSurface {...pageProps} />;
}
