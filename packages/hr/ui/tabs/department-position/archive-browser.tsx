"use client";

import type { ReactNode } from "react";
import {
  EntitySelectorPanel,
  Badge,
  Toast,
  type EntitySelectorItem,
  WorkspaceSplitPage,
} from "@workspace/core/ui";
import type { ArchivedEntityTab, Department, Position, Selection } from "./types";
import { formatArchiveTime, shortPositionCode } from "./utils";

export function ArchivedDepartmentPositionPage({
  archivedDepartments,
  archivedPositions,
  archivedTab,
  selection,
  sideOpen,
  drawerOpen,
  toast,
  onArchivedTabChange,
  onSideOpenChange,
  onDrawerOpenChange,
  onSelect,
  onToastClose,
  children,
}: {
  archivedDepartments: Department[];
  archivedPositions: Position[];
  archivedTab: ArchivedEntityTab;
  selection: Selection;
  sideOpen: boolean;
  drawerOpen: boolean;
  toast: { message: string; type: "success" | "error" } | null;
  onArchivedTabChange: (tab: ArchivedEntityTab) => void;
  onSideOpenChange: (open: boolean) => void;
  onDrawerOpenChange: (open: boolean) => void;
  onSelect: (selection: Selection) => void;
  onToastClose: () => void;
  children: ReactNode;
}) {
  const archivedItems: EntitySelectorItem[] = archivedTab === "departments"
    ? archivedDepartments.map((department) => ({
      id: department.id,
      title: department.name,
      code: department.code,
      badge: <Badge level={department.level} className="shrink-0 px-2 py-0.5 font-semibold" />,
      meta: `上级：${department.parentName || "-"} · 归档：${formatArchiveTime(department.archivedAt)}`,
    }))
    : archivedPositions.map((position) => ({
      id: position.id,
      title: position.name,
      code: position.code,
      badge: <span className="rounded bg-slate-100 px-2 py-1 font-mono text-xs text-blue-700">{shortPositionCode(position.code)}</span>,
      meta: `部门：${position.departmentName || "-"} · 归档：${formatArchiveTime(position.archivedAt)}`,
    }));
  const activeItemId = archivedTab === "departments"
    ? selection?.type === "department" ? selection.id : null
    : selection?.type === "position" ? selection.id : null;

  return (
    <>
      <WorkspaceSplitPage
        sideOpen={sideOpen}
        sideLabel="列表"
        onSideOpenChange={onSideOpenChange}
        drawerOpen={drawerOpen}
        onDrawerOpenChange={onDrawerOpenChange}
        showSideControls={false}
        renderSide={(mode) => (
          <EntitySelectorPanel
            title=""
            className={mode === "drawer" ? "h-full overflow-hidden" : ""}
            tabs={[
              { id: "departments", label: "归档部门", count: archivedDepartments.length },
              { id: "positions", label: "归档岗位", count: archivedPositions.length },
            ]}
            activeTab={archivedTab}
            onTabChange={(tab) => onArchivedTabChange(tab)}
            showHeader={false}
            items={archivedItems}
            activeItemId={activeItemId}
            emptyText={archivedTab === "departments" ? "暂无归档部门" : "暂无归档岗位"}
            onClose={mode === "drawer" ? () => onDrawerOpenChange(false) : undefined}
            onItemSelect={(item) => {
              onSelect({
                type: archivedTab === "departments" ? "department" : "position",
                id: Number(item.id),
              });
            }}
          />
        )}
      >
        {children}
      </WorkspaceSplitPage>

      <Toast
        message={toast?.message || ""}
        type={toast?.type}
        show={!!toast}
        onClose={onToastClose}
      />
    </>
  );
}
