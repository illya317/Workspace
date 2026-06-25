"use client";

import { DetailModal } from "@workspace/core/ui";

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
    <DetailModal
      open={!!positionDeptModal?.open}
      title={`${positionDeptModal?.name || ""} — 所属部门`}
      onClose={() => setPositionDeptModal(null)}
      maxWidth="max-w-md"
    >
      {positionDeptModal &&
      positionDeptModal.departments.length === 0 ? (
        <p className="text-sm text-gray-500">暂无关联部门</p>
      ) : (
        <ul className="space-y-2">
          {positionDeptModal?.departments.map((dept) => (
            <li
              key={dept}
              className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700"
            >
              {dept}
            </li>
          ))}
        </ul>
      )}
    </DetailModal>
  );
}
