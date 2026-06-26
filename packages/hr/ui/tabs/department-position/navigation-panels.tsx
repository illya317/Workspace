"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { FormSurface, NavigationSurface, PageSurface, type PageSurfaceBlockSpec } from "@workspace/core/ui";
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
  createPanel?: "department" | "position" | null;
  createPositionCode?: string;
  createPositionDepartment?: Department | undefined;
  createPositionDraft?: CreatePositionDraft;
  departmentId: number;
  departmentById?: Map<number, Department>;
  positionsByDepartment: Map<number, Position[]>;
  saving?: boolean;
  selection: Selection;
  setCreatePanel?: (panel: "department" | "position" | null) => void;
  setCreatePositionDraft?: Dispatch<SetStateAction<CreatePositionDraft>>;
  onSelect: (selection: Selection) => void;
  onCreatePosition?: () => void | Promise<void>;
}) {
  const directPositions = positionsByDepartment.get(departmentId) || [];
  const canRenderCreate = canCreatePosition && createPositionDraft && departmentById && setCreatePanel && setCreatePositionDraft && onCreatePosition;
  const creatingPositionHere = createPanel === "position" && createPositionDraft?.departmentId === departmentId;
  const addPositionButton = canRenderCreate ? (
    <FormSurface
      kind="inline"
      toolbar={{
        variant: "inline",
        items: [
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
        ],
      }}
    />
  ) : null;
  const blocks: PageSurfaceBlockSpec[] = [
    {
      kind: "moduleView",
      key: "title",
      view: (
        <>
          {sectionTitle("直属岗位", (
            <>
              <span className="text-xs font-medium text-slate-500">{directPositions.length} 个</span>
              {addPositionButton}
            </>
          ))}
        </>
      ),
    },
    directPositions.length > 0
      ? {
          kind: "moduleView",
          key: "positions",
          view: (
            <NavigationSurface
              kind="selector"
              grid={{
                value: selection?.type === "position" ? String(selection.id) : null,
                options: directPositions.map((position) => ({
                  value: String(position.id),
                  label: position.name,
                  code: shortPositionCode(position.code),
                })),
                onChange: (value) => {
                  const position = directPositions.find((p) => String(p.id) === value);
                  if (position) onSelect({ type: "position", id: position.id });
                },
                columns: 3,
                ariaLabel: "选择直属岗位",
              }}
            />
          ),
        }
      : { kind: "empty", key: "empty", presentation: "plain", compact: true, content: "暂无直属岗位" },
    ...(creatingPositionHere && canRenderCreate
      ? [{
          kind: "moduleView" as const,
          key: "create",
          view: (
            <PositionCreatePanel
              createPositionDraft={createPositionDraft}
              createPositionDepartment={createPositionDepartment}
              createPositionCode={createPositionCode || ""}
              departmentById={departmentById}
              saving={saving}
              positionDepartmentReadOnly
              className="mt-3"
              setCreatePositionDraft={setCreatePositionDraft}
              onCreatePosition={onCreatePosition}
              onCancel={() => setCreatePanel(null)}
            />
          ),
        }]
      : []),
  ];

  return (
    <PageSurface
      embedded
      kind="detail"
      blocks={[
        {
          kind: "panel",
          key: "direct-positions",
          bodyClassName: "p-4",
          blocks,
        },
      ]}
    />
  );
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
  const blocks: PageSurfaceBlockSpec[] = [];
  if (loading) blocks.push({ kind: "message", key: "loading", content: "加载中...", tone: "muted" });
  if (error) blocks.push({ kind: "message", key: "error", content: error, tone: "danger" });
  if (!loading && !error) {
    blocks.push({
      kind: "moduleView",
      key: "departments",
      view: <>{rootDepartments.map(department => renderDepartmentNode(department))}</>,
    });
  }

  return (
    <PageSurface
      embedded
      kind="detail"
      blocks={[
        {
          kind: "panel",
          key: "department-tree",
          className: mode === "drawer" ? "h-full overflow-hidden" : undefined,
          bodyClassName: `${mode === "drawer" ? "h-[calc(100%-48px)]" : "max-h-[760px]"} overflow-auto p-1`,
          actions: mode === "drawer" && onClose ? [{ key: "close", label: "关闭", onClick: onClose }] : undefined,
          blocks,
        },
      ]}
    />
  );
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
  const blocks: PageSurfaceBlockSpec[] = [];
  if (loading) blocks.push({ kind: "message", key: "loading", content: "加载中...", tone: "muted" });
  if (error) blocks.push({ kind: "message", key: "error", content: error, tone: "danger" });
  if (!loading && !error && departments.length === 0) {
    blocks.push({ kind: "empty", key: "empty", presentation: "plain", content: "暂无部门" });
  }
  if (!loading && !error && departments.length > 0) {
    blocks.push({
      kind: "moduleView",
      key: "roots",
      view: <div className="grid gap-2">{departments.map(department => renderOrganizationRoot(department))}</div>,
    });
  }

  return (
    <PageSurface
      embedded
      kind="detail"
      blocks={[
        {
          kind: "panel",
          key: "organization-roots",
          className: mode === "drawer" ? "h-full overflow-hidden" : undefined,
          bodyClassName: `${mode === "drawer" ? "h-full" : "max-h-[760px]"} overflow-auto p-1`,
          actions: mode === "drawer" && onClose ? [{ key: "close", label: "关闭", onClick: onClose }] : undefined,
          blocks,
        },
      ]}
    />
  );
}
