"use client";

import DetailModal from "@workspace/core/ui/DetailModal";
import { DataTable, type DataTableColumn } from "@workspace/core/ui";
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
  const columns: DataTableColumn<Employee>[] = [
    { key: "name", label: "姓名", required: true, render: (employee) => employee.name },
    { key: "dept1", label: "部门", required: true, render: (employee) => employee.dept1 || "-" },
    { key: "position", label: "岗位", required: true, render: (employee) => employee.position || "-" },
  ];

  return (
    <DetailModal
      open={!!detailModal?.open}
      title={`${detailModal?.name || ""} — 人员名单`}
      onClose={() => setDetailModal(null)}
    >
      {(() => {
        if (!detailModal) return null;
        const list = getDetailList({
          code: detailModal.code,
          name: detailModal.name,
        });
        return (
          <DataTable
            rows={list}
            columns={columns}
            visibleColumns={["name", "dept1", "position"]}
            density="compact"
            emptyText="暂无人员"
            rowKey={(employee) => employee.id}
            tableClassName="text-xs"
          />
        );
      })()}
    </DetailModal>
  );
}
