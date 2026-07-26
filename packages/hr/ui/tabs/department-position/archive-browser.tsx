"use client";

import {
  createMasterDetailBody,
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
  onArchivedTabChange,
  onSelect,
  sections,
  surface,
}: {
  archivedDepartments: Department[];
  archivedPositions: Position[];
  archivedTab: ArchivedEntityTab;
  selection: Selection;
  onArchivedTabChange: (tab: ArchivedEntityTab) => void;
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
  const body: BodySurfaceProps = createMasterDetailBody({
    master: { label: "归档列表", presentation: "compact", body: {
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
        emptyText: archivedTab === "departments" ? "暂无归档组织" : "暂无归档岗位",
      },
    } },
    detail: createPageBody(sections),
  });
  const pageProps: PageSurfaceStandardProps = surface
    ? { ...surface, toolbar: toolbarItems.length ? { items: toolbarItems } : undefined, body }
    : { body };
  return <PageSurface {...pageProps} />;
}
