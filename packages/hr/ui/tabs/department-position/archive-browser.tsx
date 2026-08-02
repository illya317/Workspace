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
  const toolbarItems = [
    {
      kind: "option-group" as const,
      key: "archived-entity-type",
      value: archivedTab,
      options: [
        { value: "departments", label: "部门" },
        { value: "positions", label: "岗位" },
      ],
      onChange: (value: string) => {
        if (value === "departments" || value === "positions") onArchivedTabChange(value);
      },
      ariaLabel: "归档类型",
      presentation: "segmented" as const,
    },
    ...rosterAssistantToolbarItems(surface),
  ];
  const body: BodySurfaceProps = createMasterDetailBody({
    master: { label: "归档列表", presentation: "compact", body: {
      kind: "selector",
      selector: {
        kind: "list",
        title: "归档列表",
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
  const pageProps: PageSurfaceStandardProps = {
    ...(surface ?? {}),
    toolbar: { items: toolbarItems },
    body,
  };
  return <PageSurface {...pageProps} />;
}
