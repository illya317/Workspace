"use client";

import type { Dispatch, SetStateAction } from "react";
import { createPageBody, createEmptySection, createMessageSection, createSectionsSection, createPanelSection, PageSurface, type BodySurfaceSectionSpec, type FormSurfaceProps } from "@workspace/core/ui";
import { createPositionCreatePanelSection } from "./create-panels";
import type { CreatePositionDraft, Department, DescriptionDraft, Position, Selection } from "./types";

function isBodySurfaceSectionSpec(section: BodySurfaceSectionSpec | null): section is BodySurfaceSectionSpec {
  return section !== null;
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
      body={createPageBody([createDirectPositionPanelSection({
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

export function createDirectPositionPanelSection({
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
          chrome: "plain",
          body: {
            kind: "data",
            data: {
              kind: "structured",
              rows: [[{
                content: {
                  kind: "selectionGrid",
                  mode: "select",
                  layout: "fixed",
                  columns: 2,
                  value: selection?.type === "position" ? String(selection.id) : null,
                  ariaLabel: "直属岗位",
                  options: directPositions.map((position) => ({
                    value: String(position.id),
                    label: position.name,
                    code: position.code,
                  })),
                  onChange: (value) => onSelect({ type: "position", id: Number(value) }),
                },
              }]],
              frame: "plain",
            },
          },
        }
      : {
          key: "empty",
          chrome: "plain",
          body: {
            kind: "section",
            empty: {
              presentation: "plain",
              compact: true,
              content: "暂无直属岗位",
            },
          },
        },
    ...(creatingPositionHere && canRenderCreate
      ? [createPositionCreatePanelSection({
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
  createDepartmentNodeSection
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
  createDepartmentNodeSection: (department: Department) => BodySurfaceSectionSpec | null;
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
    sections.push(...rootDepartments.map((department) => createDepartmentNodeSection(department)).filter(isBodySurfaceSectionSpec));
  }

  return (
    <PageSurface kind="standard"
      embedded
      body={createPageBody([
        createPanelSection("department-tree", {


          actions: mode === "drawer" && onClose ? [{ key: "close", label: "关闭", icon: "panel-close", onClick: onClose }] : undefined,
          sections,
        }),
      ])}
    />
  );
}

export function createDepartmentTreePanelSection({
  mode,
  loading,
  error,
  rootDepartments,
  onClose,
  createDepartmentNodeSection
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
  createDepartmentNodeSection: (department: Department) => BodySurfaceSectionSpec | null;
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
    sections.push(...rootDepartments.map((department) => createDepartmentNodeSection(department)).filter(isBodySurfaceSectionSpec));
  }

  return createPanelSection("department-tree", {


    actions: mode === "drawer" && onClose ? [{ key: "close", label: "关闭", icon: "panel-close", onClick: onClose }] : undefined,
    sections,
  });
}
export function OrganizationRootPanel({
  mode,
  loading,
  error,
  departments,
  onClose,
  createOrganizationRootSection
}: {
  mode: "desktop" | "drawer";
  loading: boolean;
  error: string | null;
  departments: Department[];
  onClose?: () => void;
  createOrganizationRootSection: (department: Department) => BodySurfaceSectionSpec | null;
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
      sections: departments.map((department) => createOrganizationRootSection(department)).filter(isBodySurfaceSectionSpec),

    }));
  }

  return (
    <PageSurface kind="standard"
      embedded
      body={createPageBody([
        createPanelSection("organization-roots", {


          actions: mode === "drawer" && onClose ? [{ key: "close", label: "关闭", icon: "panel-close", onClick: onClose }] : undefined,
          sections,
        }),
      ])}
    />
  );
}

export function createOrganizationRootPanelSection({
  mode,
  loading,
  error,
  departments,
  onClose,
  createOrganizationRootSection
}: {
  mode: "desktop" | "drawer";
  loading: boolean;
  error: string | null;
  departments: Department[];
  onClose?: () => void;
  createOrganizationRootSection: (department: Department) => BodySurfaceSectionSpec | null;
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
      sections: departments.map((department) => createOrganizationRootSection(department)).filter(isBodySurfaceSectionSpec),

    }));
  }

  return createPanelSection("organization-roots", {


    actions: mode === "drawer" && onClose ? [{ key: "close", label: "关闭", icon: "panel-close", onClick: onClose }] : undefined,
    sections,
  });
}
