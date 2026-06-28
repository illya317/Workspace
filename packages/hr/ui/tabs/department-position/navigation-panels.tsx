"use client";

import type { Dispatch, SetStateAction } from "react";
import { createBlockSurfaceBlock, createGroupBlock, createPanelBlock, PageSurface, type PageSurfaceBlockSpec } from "@workspace/core/ui";
import { buildPositionCreatePanelBlock } from "./create-panels";
import type { CreatePositionDraft, Department, Position, Selection } from "./types";
import { shortPositionCode } from "./utils";

function isPageSurfaceBlockSpec(block: PageSurfaceBlockSpec | null): block is PageSurfaceBlockSpec {
  return block !== null;
}

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
  return (
    <PageSurface
      embedded
      kind="detail"
      blocks={[buildDirectPositionPanelBlock({
        canCreatePosition,
        createPanel,
        createPositionCode,
        createPositionDepartment,
        createPositionDraft,
        departmentId,
        departmentById,
        positionsByDepartment,
        saving,
        selection,
        setCreatePanel,
        setCreatePositionDraft,
        onSelect,
        onCreatePosition,
      })]}
    />
  );
}

export function buildDirectPositionPanelBlock({
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
}): PageSurfaceBlockSpec {
  const directPositions = positionsByDepartment.get(departmentId) || [];
  const canRenderCreate = canCreatePosition && createPositionDraft && departmentById && setCreatePanel && setCreatePositionDraft && onCreatePosition;
  const creatingPositionHere = createPanel === "position" && createPositionDraft?.departmentId === departmentId;
  const blocks: PageSurfaceBlockSpec[] = [
    directPositions.length > 0
      ? {
          kind: "navigation",
          key: "positions",
          surface: {
            kind: "selector",
            grid: {
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
              },
          },
        }
      : createBlockSurfaceBlock("empty", {
        kind: "empty",
        presentation: "plain",
        compact: true,
        content: "暂无直属岗位"
      }),
    ...(creatingPositionHere && canRenderCreate
      ? [buildPositionCreatePanelBlock({
          createPositionDraft,
          createPositionDepartment,
          createPositionCode: createPositionCode || "",
          departmentById,
          saving,
          positionDepartmentReadOnly: true,
          className: "mt-3",
          setCreatePositionDraft,
          onCreatePosition,
          onCancel: () => setCreatePanel(null),
        })]
      : []),
  ];

  return createPanelBlock("direct-positions", {
          title: "直属岗位",
          subtitle: `${directPositions.length} 个`,
          actions: canRenderCreate ? [{
            key: "add-position",
            label: creatingPositionHere ? "收起新建" : "新建岗位",
            variant: creatingPositionHere ? "secondary" : "primary",
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
          }] : undefined,
          bodyClassName: "p-4",
          blocks,
        });
}
export function DepartmentTreePanel({
  mode,
  loading,
  error,
  rootDepartments,
  onClose,
  departmentNodeBlock
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
  departmentNodeBlock: (department: Department) => PageSurfaceBlockSpec | null;
}) {
  const blocks: PageSurfaceBlockSpec[] = [];
  if (loading) blocks.push(createBlockSurfaceBlock("loading", {
    kind: "message",
    content: "加载中...",
    tone: "muted"
  }));
  if (error) blocks.push(createBlockSurfaceBlock("error", {
    kind: "message",
    content: error,
    tone: "danger"
  }));
  if (!loading && !error) {
    blocks.push(...rootDepartments.map((department) => departmentNodeBlock(department)).filter(isPageSurfaceBlockSpec));
  }

  return (
    <PageSurface
      embedded
      kind="detail"
      blocks={[
        createPanelBlock("department-tree", {
          className: mode === "drawer" ? "h-full overflow-hidden" : undefined,
          bodyClassName: `${mode === "drawer" ? "h-[calc(100%-48px)]" : "max-h-[760px]"} overflow-auto p-1`,
          actions: mode === "drawer" && onClose ? [{ key: "close", label: "关闭", onClick: onClose }] : undefined,
          blocks,
        }),
      ]}
    />
  );
}

export function buildDepartmentTreePanelBlock({
  mode,
  loading,
  error,
  rootDepartments,
  onClose,
  departmentNodeBlock
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
  departmentNodeBlock: (department: Department) => PageSurfaceBlockSpec | null;
}): PageSurfaceBlockSpec {
  const blocks: PageSurfaceBlockSpec[] = [];
  if (loading) blocks.push(createBlockSurfaceBlock("loading", {
    kind: "message",
    content: "加载中...",
    tone: "muted"
  }));
  if (error) blocks.push(createBlockSurfaceBlock("error", {
    kind: "message",
    content: error,
    tone: "danger"
  }));
  if (!loading && !error) {
    blocks.push(...rootDepartments.map((department) => departmentNodeBlock(department)).filter(isPageSurfaceBlockSpec));
  }

  return createPanelBlock("department-tree", {
    className: mode === "drawer" ? "h-full overflow-hidden" : undefined,
    bodyClassName: `${mode === "drawer" ? "h-[calc(100%-48px)]" : "max-h-[760px]"} overflow-auto p-1`,
    actions: mode === "drawer" && onClose ? [{ key: "close", label: "关闭", onClick: onClose }] : undefined,
    blocks,
  });
}
export function OrganizationRootPanel({
  mode,
  loading,
  error,
  departments,
  onClose,
  organizationRootBlock
}: {
  mode: "desktop" | "drawer";
  loading: boolean;
  error: string | null;
  departments: Department[];
  onClose?: () => void;
  organizationRootBlock: (department: Department) => PageSurfaceBlockSpec | null;
}) {
  const blocks: PageSurfaceBlockSpec[] = [];
  if (loading) blocks.push(createBlockSurfaceBlock("loading", {
    kind: "message",
    content: "加载中...",
    tone: "muted"
  }));
  if (error) blocks.push(createBlockSurfaceBlock("error", {
    kind: "message",
    content: error,
    tone: "danger"
  }));
  if (!loading && !error && departments.length === 0) {
    blocks.push(createBlockSurfaceBlock("empty", {
      kind: "empty",
      presentation: "plain",
      content: "暂无部门"
    }));
  }
  if (!loading && !error && departments.length > 0) {
    blocks.push(createGroupBlock("roots", {
      blocks: departments.map((department) => organizationRootBlock(department)).filter(isPageSurfaceBlockSpec),
      className: "grid gap-2",
    }));
  }

  return (
    <PageSurface
      embedded
      kind="detail"
      blocks={[
        createPanelBlock("organization-roots", {
          className: mode === "drawer" ? "h-full overflow-hidden" : undefined,
          bodyClassName: `${mode === "drawer" ? "h-full" : "max-h-[760px]"} overflow-auto p-1`,
          actions: mode === "drawer" && onClose ? [{ key: "close", label: "关闭", onClick: onClose }] : undefined,
          blocks,
        }),
      ]}
    />
  );
}

export function buildOrganizationRootPanelBlock({
  mode,
  loading,
  error,
  departments,
  onClose,
  organizationRootBlock
}: {
  mode: "desktop" | "drawer";
  loading: boolean;
  error: string | null;
  departments: Department[];
  onClose?: () => void;
  organizationRootBlock: (department: Department) => PageSurfaceBlockSpec | null;
}): PageSurfaceBlockSpec {
  const blocks: PageSurfaceBlockSpec[] = [];
  if (loading) blocks.push(createBlockSurfaceBlock("loading", {
    kind: "message",
    content: "加载中...",
    tone: "muted"
  }));
  if (error) blocks.push(createBlockSurfaceBlock("error", {
    kind: "message",
    content: error,
    tone: "danger"
  }));
  if (!loading && !error && departments.length === 0) {
    blocks.push(createBlockSurfaceBlock("empty", {
      kind: "empty",
      presentation: "plain",
      content: "暂无部门"
    }));
  }
  if (!loading && !error && departments.length > 0) {
    blocks.push(createGroupBlock("roots", {
      blocks: departments.map((department) => organizationRootBlock(department)).filter(isPageSurfaceBlockSpec),
      className: "grid gap-2",
    }));
  }

  return createPanelBlock("organization-roots", {
    className: mode === "drawer" ? "h-full overflow-hidden" : undefined,
    bodyClassName: `${mode === "drawer" ? "h-full" : "max-h-[760px]"} overflow-auto p-1`,
    actions: mode === "drawer" && onClose ? [{ key: "close", label: "关闭", onClick: onClose }] : undefined,
    blocks,
  });
}
