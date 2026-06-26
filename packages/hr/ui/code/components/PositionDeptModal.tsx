"use client";

import { FormSurface } from "@workspace/core/ui";

interface PositionDeptModalProps {
  positionDeptModal: {
    open: boolean;
    code: string;
    name: string;
    departments: string[];
  } | null;
  setPositionDeptModal: (v: {
    open: boolean;
    code: string;
    name: string;
    departments: string[];
  } | null) => void;
}

export default function PositionDeptModal({
  positionDeptModal,
  setPositionDeptModal,
}: PositionDeptModalProps) {
  return (
    <FormSurface
      kind="modal"
      open={!!positionDeptModal?.open}
      title={`${positionDeptModal?.name || ""} — 所属部门`}
      onClose={() => setPositionDeptModal(null)}
      maxWidth="max-w-md"
      fields={
        positionDeptModal?.departments.length
          ? [{
              kind: "repeatable",
              key: "departments",
              items: positionDeptModal.departments.map((dept) => ({
                key: dept,
                fields: [{
                  kind: "readonly",
                  key: "department",
                  label: "部门",
                  value: dept,
                }],
              })),
              columns: 1,
            }]
          : [{
              kind: "note",
              key: "empty",
              content: "暂无关联部门",
            }]
      }
    />
  );
}
