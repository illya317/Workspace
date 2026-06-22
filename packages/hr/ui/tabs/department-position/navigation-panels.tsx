"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import {
  ActionButton,
  EmptyStateCard,
  PanelCard,
} from "@workspace/core/ui";
import { PositionCreatePanel } from "./create-panels";
import type { CreatePositionDraft, Department, Position, Selection } from "./types";
import { sectionTitle } from "./detail-editors";
import { shortPositionCode } from "./utils";

export function DirectPositionPanel({
  canCreatePosition = false,
  createPanel = null,
  createPositionCode,
  createPositionDepartment,
  createPositionDraft,
  departmentId,
  departmentById,
  positionsByDepartment,
  saving = false,
  selection,
  setCreatePanel,
  setCreatePositionDraft,
  onSelect,
  onCreatePosition,
}: {
  canCreatePosition?: boolean;
  createPanel?: "position" | null;
  createPositionCode?: string;
  createPositionDepartment?: Department | undefined;
  createPositionDraft?: CreatePositionDraft;
  departmentId: number;
  departmentById?: Map<number, Department>;
  positionsByDepartment: Map<number, Position[]>;
  saving?: boolean;
  selection: Selection;
  setCreatePanel?: (panel: "position" | null) => void;
  setCreatePositionDraft?: Dispatch<SetStateAction<CreatePositionDraft>>;
  onSelect: (selection: Selection) => void;
  onCreatePosition?: () => void | Promise<void>;
}) {
  const directPositions = positionsByDepartment.get(departmentId) || [];
  const canRenderCreate = canCreatePosition && createPositionDraft && departmentById && setCreatePanel && setCreatePositionDraft && onCreatePosition;
  const creatingPositionHere = createPanel === "position" && createPositionDraft?.departmentId === departmentId;
  const addPositionButton = canRenderCreate ? (
    <ActionButton
      aria-label="新建岗位"
      title="新建岗位"
      onClick={() => {
        if (creatingPositionHere) {
          setCreatePanel(null);
          return;
        }
        setCreatePositionDraft({ departmentId, name: "" });
        setCreatePanel("position");
      }}
      className="!h-8 !w-8 !rounded-full !bg-emerald-600 !p-0 !text-base !leading-none !text-white hover:!bg-emerald-700"
    >
      +
    </ActionButton>
  ) : null;

  return (
    <PanelCard bodyClassName="p-4">
      {sectionTitle(
        "直属岗位",
        <span className="text-xs font-medium text-slate-500">{directPositions.length} 个</span>
      )}
      {directPositions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {directPositions.map((position) => {
            const active = selection?.type === "position" && selection.id === position.id;
            return (
              <ActionButton
                key={position.id}
                onClick={() => onSelect({ type: "position", id: position.id })}
                className={`inline-flex max-w-full items-start gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium shadow-sm transition ${
                  active
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : "border-slate-300 bg-white text-slate-800 hover:border-blue-300 hover:bg-blue-50"
                }`}
              >
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-blue-700">{shortPositionCode(position.code)}</span>
                <span className="max-w-80 whitespace-normal break-words text-left leading-5">{position.name}</span>
              </ActionButton>
            );
          })}
          {addPositionButton}
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <EmptyStateCard compact className="flex-1">暂无直属岗位</EmptyStateCard>
          {addPositionButton}
        </div>
      )}
      {creatingPositionHere && canRenderCreate && (
        <PositionCreatePanel
          createPositionDraft={createPositionDraft}
          createPositionDepartment={createPositionDepartment}
          createPositionCode={createPositionCode || ""}
          departmentById={departmentById}
          saving={saving}
          positionDepartmentReadOnly
          className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60 px-2 py-2"
          setCreatePositionDraft={setCreatePositionDraft}
          onCreatePosition={onCreatePosition}
          onCancel={() => setCreatePanel(null)}
        />
      )}
    </PanelCard>
  );
}

export function DepartmentTreePanel({
  mode,
  loading,
  error,
  rootDepartments,
  onClose,
  renderDepartmentNode,
}: {
  mode: "desktop" | "drawer";
  isOrganizationMode: boolean;
  search: string;
  loading: boolean;
  error: string | null;
  rootDepartments: Department[];
  onSearchChange: (value: string) => void;
  onClose?: () => void;
  onCollapseAll: (collapsed: boolean) => void;
  renderDepartmentNode: (department: Department) => ReactNode;
}) {
  return (
    <PanelCard
      className={mode === "drawer" ? "h-full overflow-hidden" : ""}
      actions={mode === "drawer" ? <ActionButton onClick={onClose} className="px-2 py-1">关闭</ActionButton> : undefined}
    >
      <div className={`${mode === "drawer" ? "h-[calc(100%-48px)]" : "max-h-[760px]"} overflow-auto p-1`}>
        {loading && <EmptyStateCard compact>加载中...</EmptyStateCard>}
        {error && <EmptyStateCard compact className="border-red-100 bg-red-50 text-red-600">{error}</EmptyStateCard>}
        {!loading && !error && rootDepartments.map((department) => renderDepartmentNode(department))}
      </div>
    </PanelCard>
  );
}

export function OrganizationRootPanel({
  mode,
  loading,
  error,
  departments,
  onClose,
  renderOrganizationRoot,
}: {
  mode: "desktop" | "drawer";
  loading: boolean;
  error: string | null;
  departments: Department[];
  onClose?: () => void;
  renderOrganizationRoot: (department: Department) => ReactNode;
}) {
  return (
    <PanelCard
      className={mode === "drawer" ? "h-full overflow-hidden" : ""}
      actions={mode === "drawer" ? <ActionButton onClick={onClose} className="px-2 py-1">关闭</ActionButton> : undefined}
    >
      <div className={`${mode === "drawer" ? "h-full" : "max-h-[760px]"} overflow-auto p-1`}>
        {loading && <EmptyStateCard compact>加载中...</EmptyStateCard>}
        {error && <EmptyStateCard compact className="border-red-100 bg-red-50 text-red-600">{error}</EmptyStateCard>}
        {!loading && !error && departments.length === 0 && <EmptyStateCard>暂无部门</EmptyStateCard>}
        {!loading && !error && departments.length > 0 && (
          <div className="grid gap-2">
            {departments.map((department) => renderOrganizationRoot(department))}
          </div>
        )}
      </div>
    </PanelCard>
  );
}
