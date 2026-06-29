"use client";

import { createPageBody, PageSurface, type BodySurfaceSectionSpec } from "@workspace/core/ui";
import { useDepartmentCreatePanelSection } from "./department-create-panel";
import type { Department } from "./types";

export function useDepartmentPositionDetailSections({
  createPanel,
  departments,
  departmentById,
  canEdit,
  onCancel,
  onCreated,
  detailSections,
}: {
  createPanel: "department" | "position" | null;
  departments: Department[];
  departmentById: Map<number, Department>;
  canEdit: boolean;
  onCancel: () => void;
  onCreated: () => void | Promise<void>;
  detailSections: BodySurfaceSectionSpec[];
}): BodySurfaceSectionSpec[] {
  const createDepartmentSection = useDepartmentCreatePanelSection({
    departments,
    departmentById,
    canEdit,
    onCancel,
    onCreated,
  });
  return createPanel === "department" ? [createDepartmentSection] : detailSections;
}

export function DepartmentPositionDetailArea(props: {
  createPanel: "department" | "position" | null;
  departments: Department[];
  departmentById: Map<number, Department>;
  canEdit: boolean;
  onCancel: () => void;
  onCreated: () => void | Promise<void>;
  detailSections: BodySurfaceSectionSpec[];
}) {
  const sections = useDepartmentPositionDetailSections(props);
  return <PageSurface kind="standard" embedded body={createPageBody(sections)} />;
}
