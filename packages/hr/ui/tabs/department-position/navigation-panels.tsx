"use client";

import type { Dispatch, SetStateAction } from "react";
import { createPageBody, createEmptySection, createMessageSection, createSectionsSection, createPanelSection, PageSurface, type BodySurfaceSectionSpec, type FormSurfaceProps } from "@workspace/core/ui";
import { buildPositionCreatePanelBlock } from "./create-panels";
import type { CreatePositionDraft, Department, DescriptionDraft, Position, Selection } from "./types";
import { shortPositionCode } from "./utils";

function isBodySurfaceSectionSpec(block: BodySurfaceSectionSpec | null): block is BodySurfaceSectionSpec {
  return block !== null;
}

export function DirectPositionPanel({
  canCreatePosition = false,
  createPanel = null,
  createPositionCode,
  createPositionDescriptionDetailsSurface,
  createPositionDescriptionDraft,
  createPositionDepartment,
  createPositionDraft,
  departmentId,
  departmentById,
  positionsByDepartment,
  saving = false,
  selection,
  setCreatePanel,
  setCreatePositionDescriptionDraft,
  setCreatePositionDraft,
  onSelect,
  onCreatePosition
}: {
  canCreatePosition?: boolean;
  createPanel?: "department" | "position" | null;
  createPositionCode?: string;
  createPositionDescriptionDetailsSurface?: FormSurfaceProps;
  createPositionDescriptionDraft?: DescriptionDraft;
  createPositionDepartment?: Department | undefined;
  createPositionDraft?: CreatePositionDraft;
  departmentId: number;
  departmentById?: Map<number, Department>;
  positionsByDepartment: Map<number, Position[]>;
  saving?: boolean;
  selection: Selection;
  setCreatePanel?: (panel: "department" | "position" | null) => void;
  setCreatePositionDescriptionDraft?: Dispatch<SetStateAction<DescriptionDraft>>;
  setCreatePositionDraft?: Dispatch<SetStateAction<CreatePositionDraft>>;
  onSelect: (selection: Selection) => void;
  onCreatePosition?: (descriptionDraft: DescriptionDraft) => void | Promise<void>;
}) {
  return (
    <PageSurface kind="standard"
      embedded
      body={createPageBody([buildDirectPositionPanelBlock({
        canCreatePosition,
        createPanel,
        createPositionCode,
        createPositionDescriptionDetailsSurface,
        createPositionDescriptionDraft,
        createPositionDepartment,
        createPositionDraft,
        departmentId,
        departmentById,
        positionsByDepartment,
        saving,
        selection,
        setCreatePanel,
        setCreatePositionDescriptionDraft,
        setCreatePositionDraft,
        onSelect,
        onCreatePosition,
      })])}
    />
  );
}

export function buildDirectPositionPanelBlock({
  canCreatePosition = false,
  createPanel = null,
  createPositionCode,
  createPositionDescriptionDetailsSurface,
  createPositionDescriptionDraft,
  createPositionDepartment,
  createPositionDraft,
  departmentId,
  departmentById,
  positionsByDepartment,
  saving = false,
  selection,
  setCreatePanel,
  setCreatePositionDescriptionDraft,
  setCreatePositionDraft,
  onSelect,
  onCreatePosition
}: {
  canCreatePosition?: boolean;
  createPanel?: "department" | "position" | null;
  createPositionCode?: string;
  createPositionDescriptionDetailsSurface?: FormSurfaceProps;
  createPositionDescriptionDraft?: DescriptionDraft;
  createPositionDepartment?: Department | undefined;
  createPositionDraft?: CreatePositionDraft;
  departmentId: number;
  departmentById?: Map<number, Department>;
  positionsByDepartment: Map<number, Position[]>;
  saving?: boolean;
  selection: Selection;
  setCreatePanel?: (panel: "department" | "position" | null) => void;
  setCreatePositionDescriptionDraft?: Dispatch<SetStateAction<DescriptionDraft>>;
  setCreatePositionDraft?: Dispatch<SetStateAction<CreatePositionDraft>>;
  onSelect: (selection: Selection) => void;
  onCreatePosition?: (descriptionDraft: DescriptionDraft) => void | Promise<void>;
}): BodySurfaceSectionSpec {
  const directPositions = positionsByDepartment.get(departmentId) || [];
  const canRenderCreate = canCreatePosition && createPositionDraft && createPositionDescriptionDraft && createPositionDescriptionDetailsSurface && departmentById && setCreatePanel && setCreatePositionDraft && setCreatePositionDescriptionDraft && onCreatePosition;
  const creatingPositionHere = createPanel === "position" && createPositionDraft?.departmentId === departmentId;
  const sections: BodySurfaceSectionSpec[] = [
    directPositions.length > 0
      ? {
          key: "positions",
          body: {
            kind: "navigation",
            navigation: {
              kind: "grid",
              value: selection?.type === "position" ? String(selection.id) : null,
              options: directPositions.map((position) => ({
                value: String(position.id),
                label: position.name,
                code: shortPositionCode(position.code),
              })),
              onChange: (value: string | null) => {
                const position = directPositions.find((p) => String(p.id) === value);
                if (position) onSelect({ type: "position", id: position.id });
              },
              columns: 3,
              ariaLabel: "选择直属岗位",
            },
          },
        }
      : createEmptySection("empty", {
        presentation: "plain",
        compact: true,
        content: "暂无直属岗位"
      }),
    ...(creatingPositionHere && canRenderCreate
      ? [buildPositionCreatePanelBlock({
          createPositionDraft,
          createPositionDescriptionDraft,
          createPositionDescriptionDetailsSurface,
          createPositionDepartment,
          createPositionCode: createPositionCode || "",
          departmentById,
          saving,
          positionDepartmentReadOnly: true,

          setCreatePositionDraft,
          setCreatePositionDescriptionDraft,
          onCreatePosition,
          onCancel: () => setCreatePanel(null),
        })]
      : []),
  ];

  return createPanelSection("direct-positions", {
    title: "直属岗位",
    subtitle: `${directPositions.length} 个`,
    actions: canRenderCreate ? [{
      key: "add-position",
      label: creatingPositionHere ? "收起新建" : "新建岗位",
      icon: creatingPositionHere ? "panel-close" : "create",
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
    sections,
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
  departmentNodeBlock: (department: Department) => BodySurfaceSectionSpec | null;
}) {
  const sections: BodySurfaceSectionSpec[] = [];
  if (loading) sections.push(createMessageSection("loading", {
    content: "加载中...",
    tone: "muted"
  }));
  if (error) sections.push(createMessageSection("error", {
    content: error,
    tone: "danger"
  }));
  if (!loading && !error) {
    sections.push(...rootDepartments.map((department) => departmentNodeBlock(department)).filter(isBodySurfaceSectionSpec));
  }

  return (
    <PageSurface kind="standard"
      embedded
      body={createPageBody([
        createPanelSection("department-tree", {


          actions: mode === "drawer" && onClose ? [{ key: "close", label: "关闭", onClick: onClose }] : undefined,
          sections,
        }),
      ])}
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
  departmentNodeBlock: (department: Department) => BodySurfaceSectionSpec | null;
}): BodySurfaceSectionSpec {
  const sections: BodySurfaceSectionSpec[] = [];
  if (loading) sections.push(createMessageSection("loading", {
    content: "加载中...",
    tone: "muted"
  }));
  if (error) sections.push(createMessageSection("error", {
    content: error,
    tone: "danger"
  }));
  if (!loading && !error) {
    sections.push(...rootDepartments.map((department) => departmentNodeBlock(department)).filter(isBodySurfaceSectionSpec));
  }

  return createPanelSection("department-tree", {


    actions: mode === "drawer" && onClose ? [{ key: "close", label: "关闭", onClick: onClose }] : undefined,
    sections,
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
  organizationRootBlock: (department: Department) => BodySurfaceSectionSpec | null;
}) {
  const sections: BodySurfaceSectionSpec[] = [];
  if (loading) sections.push(createMessageSection("loading", {
    content: "加载中...",
    tone: "muted"
  }));
  if (error) sections.push(createMessageSection("error", {
    content: error,
    tone: "danger"
  }));
  if (!loading && !error && departments.length === 0) {
    sections.push(createEmptySection("empty", {
      presentation: "plain",
      content: "暂无部门"
    }));
  }
  if (!loading && !error && departments.length > 0) {
    sections.push(createSectionsSection("roots", {
      sections: departments.map((department) => organizationRootBlock(department)).filter(isBodySurfaceSectionSpec),

    }));
  }

  return (
    <PageSurface kind="standard"
      embedded
      body={createPageBody([
        createPanelSection("organization-roots", {


          actions: mode === "drawer" && onClose ? [{ key: "close", label: "关闭", onClick: onClose }] : undefined,
          sections,
        }),
      ])}
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
  organizationRootBlock: (department: Department) => BodySurfaceSectionSpec | null;
}): BodySurfaceSectionSpec {
  const sections: BodySurfaceSectionSpec[] = [];
  if (loading) sections.push(createMessageSection("loading", {
    content: "加载中...",
    tone: "muted"
  }));
  if (error) sections.push(createMessageSection("error", {
    content: error,
    tone: "danger"
  }));
  if (!loading && !error && departments.length === 0) {
    sections.push(createEmptySection("empty", {
      presentation: "plain",
      content: "暂无部门"
    }));
  }
  if (!loading && !error && departments.length > 0) {
    sections.push(createSectionsSection("roots", {
      sections: departments.map((department) => organizationRootBlock(department)).filter(isBodySurfaceSectionSpec),

    }));
  }

  return createPanelSection("organization-roots", {


    actions: mode === "drawer" && onClose ? [{ key: "close", label: "关闭", onClick: onClose }] : undefined,
    sections,
  });
}
