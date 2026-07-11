"use client";

import { createPageBody, BodySurface, type BodySurfaceSectionSpec } from "@workspace/core/ui";
import { useDepartmentCreateSurface } from "./department-create-panel";
import type { Department } from "./types";
import type { ActionRuntime } from "@workspace/platform/workflow-action-runtime";

export function useDepartmentPositionDetailSections({
  createPanel,
  departments,
  departmentById,
  canEdit,
  canSubmitWorkflow,
  actionRuntime,
  onCreatePanelChange,
  onCancel,
  onCreated,
  detailSections,
}: {
  createPanel: "department" | "position" | null;
  departments: Department[];
  departmentById: Map<number, Department>;
  canEdit: boolean;
  canSubmitWorkflow: boolean;
  actionRuntime: ActionRuntime | null;
  onCreatePanelChange: (panel: "department" | "position" | null) => void;
  onCancel: () => void;
  onCreated: () => void | Promise<void>;
  detailSections: BodySurfaceSectionSpec[];
}): BodySurfaceSectionSpec[] {
  const createDepartmentSurface = useDepartmentCreateSurface({
    departments,
    departmentById,
    canEdit,
    canSubmitWorkflow,
    actionRuntime,
    open: createPanel === "department",
    onOpenChange: (open) => onCreatePanelChange(open ? "department" : null),
    onCancel,
    onCreated,
  });
  return [
    { key: "department-create", chrome: "plain", body: { kind: "create", create: createDepartmentSurface } },
    ...(createPanel === "department" ? [] : detailSections),
  ];
}

export function DepartmentPositionDetailArea(props: {
  createPanel: "department" | "position" | null;
  departments: Department[];
  departmentById: Map<number, Department>;
  canEdit: boolean;
  canSubmitWorkflow: boolean;
  actionRuntime: ActionRuntime | null;
  onCreatePanelChange: (panel: "department" | "position" | null) => void;
  onCancel: () => void;
  onCreated: () => void | Promise<void>;
  detailSections: BodySurfaceSectionSpec[];
}) {
  const sections = useDepartmentPositionDetailSections(props);
  return <BodySurface {...createPageBody(sections)} />;
}
