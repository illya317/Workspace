"use client";

import DetailModal from "@/app/components/DetailModal";
import type { Employee, CodeItem } from "../types";

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
        if (list.length === 0)
          return <p className="text-sm text-gray-500">暂无人员</p>;
        return (
          <table className="w-full text-xs">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">
                  姓名
                </th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">
                  部门
                </th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">
                  岗位
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((emp) => (
                <tr
                  key={emp.id}
                  className="border-b last:border-0 hover:bg-gray-50"
                >
                  <td className="px-3 py-2 text-gray-700">{emp.name}</td>
                  <td className="px-3 py-2 text-gray-700">
                    {emp.dept1 || "-"}
                  </td>
                  <td className="px-3 py-2 text-gray-700">
                    {emp.position || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      })()}
    </DetailModal>
  );
}
