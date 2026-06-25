"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { EmptyStateCard, OptionPicker, PanelCard, Toolbar } from "@workspace/core/ui";
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
  onCreatePosition
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
    <Toolbar
      variant="inline"
      items={[
        {
          kind: "create",
          key: "add-position",
          label: "新建岗位",
          active: creatingPositionHere,
          onClick: () => {
            if (creatingPositionHere) {
              setCreatePanel(null);
              return;
            }
            setCreatePositionDraft({
              departmentId,
              name: ""
            });
            setCreatePanel("position");
          },
        },
      ]}
    />
  ) : null;
  return <PanelCard bodyClassName="p-4">
      {sectionTitle("直属岗位", <span className="text-xs font-medium text-slate-500">{directPositions.length} 个</span>)}
      {directPositions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <OptionPicker
            value={selection?.type === "position" ? String(selection.id) : ""}
            options={directPositions.map((position) => ({
              value: String(position.id),
              label: position.name,
            }))}
            onChange={(value) => {
              const position = directPositions.find((p) => String(p.id) === value);
              if (position) onSelect({ type: "position", id: position.id });
            }}
            renderOption={(option) => {
              const position = directPositions.find((p) => String(p.id) === option.value)!;
              return (
                <span className="inline-flex max-w-full items-start gap-2">
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-blue-700">{shortPositionCode(position.code)}</span>
                  <span className="max-w-80 whitespace-normal break-words text-left leading-5">{position.name}</span>
                </span>
              );
            }}
            formatValueLabel={(_, option) => option?.label ?? "选择岗位"}
            placeholder="选择岗位"
            visibleCount={directPositions.length}
            gridColumns={3}
            buttonClassName="h-10 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            popoverClassName="absolute left-0 top-[calc(100%+0.35rem)] z-50 w-72 rounded-lg border border-slate-200 bg-white p-2.5 shadow-xl"
          />
          {addPositionButton}
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <EmptyStateCard compact className="flex-1">暂无直属岗位</EmptyStateCard>
          {addPositionButton}
        </div>
      )}
      {creatingPositionHere && canRenderCreate && <PositionCreatePanel createPositionDraft={createPositionDraft} createPositionDepartment={createPositionDepartment} createPositionCode={createPositionCode || ""} departmentById={departmentById} saving={saving} positionDepartmentReadOnly className="mt-3" setCreatePositionDraft={setCreatePositionDraft} onCreatePosition={onCreatePosition} onCancel={() => setCreatePanel(null)} />}
    </PanelCard>;
}
export function DepartmentTreePanel({
  mode,
  loading,
  error,
  rootDepartments,
  onClose,
  renderDepartmentNode
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
  return <PanelCard className={mode === "drawer" ? "h-full overflow-hidden" : ""} actions={mode === "drawer" ? <Toolbar variant="inline" items={[{ kind: "icon-button", key: "close", icon: "panel-close", label: "关闭", onClick: onClose }]} /> : undefined}>
      <div className={`${mode === "drawer" ? "h-[calc(100%-48px)]" : "max-h-[760px]"} overflow-auto p-1`}>
        {loading && <EmptyStateCard compact>加载中...</EmptyStateCard>}
        {error && <EmptyStateCard compact className="border-red-100 bg-red-50 text-red-600">{error}</EmptyStateCard>}
        {!loading && !error && rootDepartments.map(department => renderDepartmentNode(department))}
      </div>
    </PanelCard>;
}
export function OrganizationRootPanel({
  mode,
  loading,
  error,
  departments,
  onClose,
  renderOrganizationRoot
}: {
  mode: "desktop" | "drawer";
  loading: boolean;
  error: string | null;
  departments: Department[];
  onClose?: () => void;
  renderOrganizationRoot: (department: Department) => ReactNode;
}) {
  return <PanelCard className={mode === "drawer" ? "h-full overflow-hidden" : ""} actions={mode === "drawer" ? <Toolbar variant="inline" items={[{ kind: "icon-button", key: "close", icon: "panel-close", label: "关闭", onClick: onClose }]} /> : undefined}>
      <div className={`${mode === "drawer" ? "h-full" : "max-h-[760px]"} overflow-auto p-1`}>
        {loading && <EmptyStateCard compact>加载中...</EmptyStateCard>}
        {error && <EmptyStateCard compact className="border-red-100 bg-red-50 text-red-600">{error}</EmptyStateCard>}
        {!loading && !error && departments.length === 0 && <EmptyStateCard>暂无部门</EmptyStateCard>}
        {!loading && !error && departments.length > 0 && <div className="grid gap-2">
            {departments.map(department => renderOrganizationRoot(department))}
          </div>}
      </div>
    </PanelCard>;
}
