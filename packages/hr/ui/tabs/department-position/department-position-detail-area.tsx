"use client";

import { createPageBody, PageSurface, type PageSurfaceSectionSpec } from "@workspace/core/ui";
import { useDepartmentCreatePanelBlock } from "./department-create-panel";
import type { Department } from "./types";

export function useDepartmentPositionDetailBlocks({
  createPanel,
  departments,
  departmentById,
  canEdit,
  onCancel,
  onCreated,
  detailBlocks,
}: {
  createPanel: "department" | "position" | null;
  departments: Department[];
  departmentById: Map<number, Department>;
  canEdit: boolean;
  onCancel: () => void;
  onCreated: () => void | Promise<void>;
  detailBlocks: PageSurfaceSectionSpec[];
}): PageSurfaceSectionSpec[] {
  const createDepartmentBlock = useDepartmentCreatePanelBlock({
    departments,
    departmentById,
    canEdit,
    onCancel,
    onCreated,
  });
  return createPanel === "department" ? [createDepartmentBlock] : detailBlocks;
}

export function DepartmentPositionDetailArea(props: {
  createPanel: "department" | "position" | null;
  departments: Department[];
  departmentById: Map<number, Department>;
  canEdit: boolean;
  onCancel: () => void;
  onCreated: () => void | Promise<void>;
  detailBlocks: PageSurfaceSectionSpec[];
}) {
  const sections = useDepartmentPositionDetailBlocks(props);
  return <PageSurface kind="standard" embedded body={createPageBody(sections)} />;
}
