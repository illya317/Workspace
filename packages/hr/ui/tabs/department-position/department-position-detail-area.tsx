"use client";

import { createPageBody, BodySurface, type BodySurfaceSectionSpec } from "@workspace/core/ui";
import { useDepartmentCreateSurface } from "./department-create-panel";
import type { Department, OrganizationCodeConfig } from "./types";
import type { ActionRuntime } from "@workspace/platform/workflow-action-runtime";

export function useDepartmentPositionDetailSections({
  createPanel,
  departments,
  codeConfig,
  departmentById,
  actionRuntime,
  onCreatePanelChange,
  onCancel,
  onCreated,
  detailSections,
}: {
  createPanel: "department" | "position" | null;
  departments: Department[];
  codeConfig: OrganizationCodeConfig | null;
  departmentById: Map<number, Department>;
  actionRuntime: ActionRuntime | null;
  onCreatePanelChange: (panel: "department" | "position" | null) => void;
  onCancel: () => void;
  onCreated: () => void | Promise<void>;
  detailSections: BodySurfaceSectionSpec[];
}): BodySurfaceSectionSpec[] {
  const createDepartmentSurface = useDepartmentCreateSurface({
    departments,
    codeConfig,
    departmentById,
    actionRuntime,
    open: createPanel === "department",
    onOpenChange: (open) => onCreatePanelChange(open ? "department" : null),
    onCancel,
    onCreated,
  });
  return [
    { key: "department-create", body: { kind: "create", create: createDepartmentSurface } },
    ...(createPanel === "department" ? [] : detailSections),
  ];
}

export function DepartmentPositionDetailArea(props: {
  createPanel: "department" | "position" | null;
  departments: Department[];
  codeConfig: OrganizationCodeConfig | null;
  departmentById: Map<number, Department>;
  actionRuntime: ActionRuntime | null;
  onCreatePanelChange: (panel: "department" | "position" | null) => void;
  onCancel: () => void;
  onCreated: () => void | Promise<void>;
  detailSections: BodySurfaceSectionSpec[];
}) {
  const sections = useDepartmentPositionDetailSections(props);
  return <BodySurface {...createPageBody(sections)} />;
}
