"use client";

import type { ReactNode } from "react";
import { DepartmentCreatePanel } from "./department-create-panel";
import type { Department } from "./types";

export function DepartmentPositionDetailArea({
  createPanel,
  departments,
  departmentById,
  canEdit,
  onCancel,
  onCreated,
  renderDetailPane,
}: {
  createPanel: "department" | "position" | null;
  departments: Department[];
  departmentById: Map<number, Department>;
  canEdit: boolean;
  onCancel: () => void;
  onCreated: () => void | Promise<void>;
  renderDetailPane: () => ReactNode;
}) {
  if (createPanel === "department") {
    return (
      <DepartmentCreatePanel
        departments={departments}
        departmentById={departmentById}
        canEdit={canEdit}
        onCancel={onCancel}
        onCreated={onCreated}
      />
    );
  }
  return renderDetailPane();
}
