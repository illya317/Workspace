"use client";

import type { ReactNode } from "react";
import {
  Badge,
  EmptyStateCard,
  ActionButton,
  PanelCard,
  SelectorList,
  TabBar,
  TagPill,
  Toast,
  WorkspaceSplitPage,
} from "@workspace/core/ui";
import type { ArchivedEntityTab, Department, Position, Selection } from "./types";
import { formatArchiveTime, shortPositionCode } from "./utils";

interface ArchivedEntityItem {
  id: string | number;
  title: ReactNode;
  code?: ReactNode;
  badge?: ReactNode;
  meta?: ReactNode;
}

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
  const archivedItems: ArchivedEntityItem[] = archivedTab === "departments"
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
      badge: <TagPill>{shortPositionCode(position.code)}</TagPill>,
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
          <PanelCard className={mode === "drawer" ? "h-full overflow-hidden" : ""} bodyClassName="p-3">
            {mode === "drawer" && (
              <div className="flex justify-end">
                <ActionButton
                  kind="panel-close"
                  label="关闭"
                  onClick={() => onDrawerOpenChange(false)}
                />
              </div>
            )}

            <TabBar
              className="mt-3"
              variant="micro"
              active={archivedTab}
              onChange={(tab) => onArchivedTabChange(tab as ArchivedEntityTab)}
              tabs={[
                { key: "departments", label: <>归档部门 <span className="ml-1 text-xs font-medium text-slate-400">{archivedDepartments.length}</span></> },
                { key: "positions", label: <>归档岗位 <span className="ml-1 text-xs font-medium text-slate-400">{archivedPositions.length}</span></> },
              ]}
            />

            <div className="mt-3 max-h-[620px] space-y-2 overflow-auto">
              {archivedItems.length === 0 ? (
                <EmptyStateCard compact>
                  {archivedTab === "departments" ? "暂无归档部门" : "暂无归档岗位"}
                </EmptyStateCard>
              ) : (
                <SelectorList
                  items={archivedItems}
                  selectedId={activeItemId}
                  onSelect={(item) => onSelect({
                    type: archivedTab === "departments" ? "department" : "position",
                    id: Number(item.id),
                  })}
                  getKey={(item) => item.id}
                  renderItem={(item) => ({
                    title: item.title,
                    code: item.code,
                    metaLine: item.meta,
                    leading: item.badge,
                  })}
                  size="sm"
                />
              )}
            </div>
          </PanelCard>
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
