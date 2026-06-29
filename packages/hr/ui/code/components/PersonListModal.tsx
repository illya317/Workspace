"use client";

import { createPageBody, PageSurface, createFieldsSection, createPageModalSection } from "@workspace/core/ui";
import type { Employee, CodeItem } from "@workspace/hr/types";

interface PersonListModalProps {
  detailModal: { open: boolean; code: string; name: string } | null;
  setDetailModal: (v: { open: boolean; code: string; name: string } | null) => void;
  getDetailList: (item: CodeItem) => Employee[];
}

export default function PersonListModal({
  detailModal,
  setDetailModal,
  getDetailList,
}: PersonListModalProps) {
  const list = detailModal
    ? getDetailList({
        code: detailModal.code,
        name: detailModal.name,
      })
    : [];

  return (
    <PageSurface kind="standard"
      embedded
      body={createPageBody([
        createPageModalSection("person-list", {
          open: !!detailModal?.open,
          title: `${detailModal?.name || ""} — 人员名单`,
          onClose: () => setDetailModal(null),
          sections: [
            createFieldsSection("person-list-form", list.length === 0 ? [{
              kind: "note",
              key: "empty",
              content: "暂无人员",
            }] : [{
              kind: "repeatable",
              key: "people",
              items: list.map((employee) => ({
                key: String(employee.id),
                items: [
                  { kind: "readonly", key: "name", label: "姓名", value: employee.name },
                  { kind: "readonly", key: "dept1", label: "部门", value: employee.dept1 || "-" },
                  { kind: "readonly", key: "position", label: "岗位", value: employee.position || "-" },
                ],
              })),
              layout: { columns: 3 },
            }]),
          ],
        }),
      ])}
    />
  );
}
