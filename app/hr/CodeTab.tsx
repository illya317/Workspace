"use client";

import { useEffect, useState } from "react";
import EditToolbar from "@/app/components/EditToolbar";
import ConfirmModal from "@/app/components/ConfirmModal";
import AuditLogModal from "@/app/components/AuditLogModal";
import DetailModal from "@/app/components/DetailModal";
import Toast from "@/app/components/Toast";
import { NAME_TO_CODE, isBio, isPharma, SHARED_GROUP_CODES, resolveCompanyFilter } from "@/lib/company";
import { useCodeTab } from "@/app/hr/useCodeTab";

import type { HRUser as User } from "./types";

interface Employee {
  id: number;
  employeeId: string;
  name: string;
  company: string | null;
  center: string | null;
  dept1: string | null;
  dept2: string | null;
  position: string | null;
  gender: string | null;
  ethnicity: string | null;
  hometown: string | null;
  politics: string | null;
  education: string | null;
  title: string | null;
  school: string | null;
  major: string | null;
  phone: string | null;
  joinDate: string | null;
  nature: string | null;
  status?: string | null;
  leaveDate?: string | null;
  alias?: string | null;
}

interface CodeItem {
  code: string;
  name: string;
}

export function CodesTab({
  user,
  selectedCompany,
}: {
  user: User;
  selectedCompany: string;
}) {
  const companyCode = NAME_TO_CODE[selectedCompany] || "";
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  return (
    <div className="flex gap-6">
      <div className="w-1/2">
        <CodeTab
          user={user}
          type="department"
          apiPath="/api/admin/department-codes"
          title="部门编码"
          companyCode={companyCode}
          selectedCompany={selectedCompany}
          onSelect={(code) => {
            setSelectedDept((prev) => (prev === code ? null : code));
          }}
          selectedCode={selectedDept || undefined}
        />
      </div>
      <div className="w-1/2">
        <CodeTab
          user={user}
          type="position"
          apiPath="/api/admin/position-codes"
          title="岗位编码"
          companyCode={companyCode}
          selectedCompany={selectedCompany}
          departmentCode={selectedDept || undefined}
        />
      </div>
    </div>
  );
}

export default function CodeTab({
  user,
  type,
  apiPath,
  title,
  companyCode,
  selectedCompany,
  onSelect,
  selectedCode,
  departmentCode,
}: {
  user: User;
  type: "department" | "position";
  apiPath: string;
  title: string;
  companyCode: string;
  selectedCompany: string;
  onSelect?: (code: string) => void;
  selectedCode?: string;
  departmentCode?: string;
}) {
  const {
    codes,
    employees,
    stats,
    loading,
    toast,
    showToast,
    closeToast,
    newCode,
    setNewCode,
    newName,
    setNewName,
    deleteCode,
    setDeleteCode,
    sortField,
    sortDirection,
    editMode,
    setEditMode,
    editRow,
    setEditRow,
    editCodeValue,
    setEditCodeValue,
    editNameValue,
    setEditNameValue,
    detailModal,
    setDetailModal,
    positionDeptModal,
    setPositionDeptModal,
    saving,
    showHistory,
    setShowHistory,
    entityType,
    sortedCodes,
    toggleSort,
    startEditRow,
    saveEditRow,
    doDelete,
    handleAdd,
    getDetailList,
    loadPositionDepts,
    handleSave,
  } = useCodeTab({
    user,
    type,
    apiPath,
    companyCode,
    selectedCompany,
    departmentCode,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        {user.canAccessHR && (
          <EditToolbar
            editMode={editMode}
            onStartEdit={() => setEditMode(true)}
            onSave={handleSave}
            onCancel={() => {
              setEditRow(null);
              setEditMode(false);
            }}
            canEdit={user.canAccessHR}
            onShowHistory={() => setShowHistory(true)}
            saving={saving}
          />
        )}
      </div>

      <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
        {loading ? (
          <p className="p-8 text-center text-gray-500">加载中...</p>
        ) : (
          <table className="w-full table-fixed text-xs">
            <thead className="border-b bg-gray-50">
              <tr>
                <th
                  onClick={() => toggleSort("code")}
                  className="w-24 cursor-pointer whitespace-nowrap px-2 py-1.5 text-left font-medium text-gray-600 hover:bg-gray-100 select-none"
                >
                  <span className="flex items-center gap-1">
                    编号
                    {sortField === "code" && (
                      <span className="text-emerald-500">
                        {sortDirection === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </span>
                </th>
                <th
                  onClick={() => toggleSort("name")}
                  className="cursor-pointer whitespace-nowrap px-2 py-1.5 text-left font-medium text-gray-600 hover:bg-gray-100 select-none"
                >
                  <span className="flex items-center gap-1">
                    名称
                    {sortField === "name" && (
                      <span className="text-emerald-500">
                        {sortDirection === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </span>
                </th>
                <th
                  onClick={() => toggleSort("count")}
                  className="w-16 cursor-pointer whitespace-nowrap px-2 py-1.5 text-right font-medium text-gray-600 hover:bg-gray-100 select-none"
                >
                  <span className="flex items-center justify-end gap-1">
                    人数
                    {sortField === "count" && (
                      <span className="text-emerald-500">
                        {sortDirection === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const bioCodes = sortedCodes.filter((c) => isBio(c.code));
                const pharmaCodes = sortedCodes.filter((c) => isPharma(c.code));
                const bioTotal = bioCodes.reduce(
                  (sum, c) => sum + (stats[c.code] || 0),
                  0
                );
                const pharmaTotal = pharmaCodes.reduce(
                  (sum, c) => sum + (stats[c.code] || 0),
                  0
                );
                const grandTotal = sortedCodes.reduce(
                  (sum, c) => sum + (stats[c.code] || 0),
                  0
                );
                const renderRow = (item: CodeItem) => {
                  const isEditing = editRow === item.code;
                  const count = stats[item.code] || 0;
                  const isSelected = selectedCode === item.code;
                  return (
                    <tr
                      key={item.code}
                      className={`border-b last:border-0 hover:bg-gray-50 ${isSelected ? "bg-emerald-50" : ""}`}
                    >
                      <td className="whitespace-nowrap px-2 py-1.5 text-gray-700">
                        {isEditing ? (
                          <input
                            value={editCodeValue}
                            onChange={(e) =>
                              setEditCodeValue(e.target.value)
                            }
                            className="w-full rounded border border-emerald-400 px-1 py-0.5 text-xs focus:outline-none"
                          />
                        ) : (
                          <span
                            className={
                              onSelect
                                ? "cursor-pointer hover:text-emerald-600"
                                : ""
                            }
                            onClick={() => {
                              if (onSelect) onSelect(item.code);
                            }}
                          >
                            {item.code}
                            {editMode && user.canAccessHR && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteCode(item.code);
                                }}
                                className="ml-0.5 text-red-500 hover:text-red-700"
                                title="删除"
                              >
                                ×
                              </button>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-gray-700">
                        {isEditing ? (
                          <input
                            value={editNameValue}
                            onChange={(e) =>
                              setEditNameValue(e.target.value)
                            }
                            className="w-full rounded border border-emerald-400 px-1 py-0.5 text-xs focus:outline-none"
                          />
                        ) : (
                          <span
                            className="cursor-pointer hover:text-emerald-600"
                            onClick={() =>
                              editMode && user.canAccessHR
                                ? startEditRow(item)
                                : onSelect
                                  ? onSelect(item.code)
                                  : type === "position"
                                    ? loadPositionDepts(item)
                                    : setDetailModal({
                                        open: true,
                                        code: item.code,
                                        name: item.name,
                                      })
                            }
                          >
                            {item.name || "-"}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right text-gray-700">
                        <span
                          className="cursor-pointer rounded-full bg-gray-100 px-2 py-0.5 text-xs hover:bg-gray-200"
                          onClick={() =>
                            setDetailModal({
                              open: true,
                              code: item.code,
                              name: item.name,
                            })
                          }
                        >
                          {count}
                        </span>
                      </td>
                    </tr>
                  );
                };
                return (
                  <>
                    {bioCodes.length > 0 && (
                      <>
                        <tr className="bg-gray-100">
                          <td
                            colSpan={3}
                            className="px-2 py-1 font-medium text-gray-600"
                          >
                            常规体系
                          </td>
                        </tr>
                        {bioCodes.map(renderRow)}
                        <tr className="border-b bg-gray-50">
                          <td className="px-2 py-1.5" />
                          <td className="whitespace-nowrap px-2 py-1.5 text-right font-medium text-gray-600">
                            小计
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-right">
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                              {bioTotal}
                            </span>
                          </td>
                        </tr>
                      </>
                    )}
                    {pharmaCodes.length > 0 && (
                      <>
                        <tr className="bg-gray-100">
                          <td
                            colSpan={3}
                            className="px-2 py-1 font-medium text-gray-600"
                          >
                            GMP
                          </td>
                        </tr>
                        {pharmaCodes.map(renderRow)}
                        <tr className="border-b bg-gray-50">
                          <td className="px-2 py-1.5" />
                          <td className="whitespace-nowrap px-2 py-1.5 text-right font-medium text-gray-600">
                            小计
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-right">
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                              {pharmaTotal}
                            </span>
                          </td>
                        </tr>
                      </>
                    )}
                    <tr className="bg-gray-100">
                      <td className="px-2 py-1.5" />
                      <td className="whitespace-nowrap px-2 py-1.5 text-right font-bold text-gray-700">
                        合计
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right">
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                          {grandTotal}
                        </span>
                      </td>
                    </tr>
                    {editMode && user.canAccessHR && (
                      <tr className="border-b last:border-0 bg-gray-50">
                        <td className="whitespace-nowrap px-2 py-1.5">
                          <input
                            type="text"
                            value={newCode}
                            onChange={(e) => setNewCode(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleAdd();
                            }}
                            placeholder="如001"
                            className="w-full rounded border border-gray-300 px-1 py-0.5 text-xs focus:border-emerald-400 focus:outline-none"
                          />
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5">
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={newName}
                              onChange={(e) => setNewName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleAdd();
                              }}
                              placeholder="名称"
                              className="w-full rounded border border-gray-300 px-1 py-0.5 text-xs focus:border-emerald-400 focus:outline-none"
                            />
                            <button
                              onClick={handleAdd}
                              className="rounded-md bg-emerald-600 px-3 py-1 text-xs text-white hover:bg-emerald-700"
                            >
                              添加
                            </button>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-gray-400">
                          -
                        </td>
                      </tr>
                    )}
                  </>
                );
              })()}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmModal
        open={!!deleteCode}
        title="删除确认"
        message="确定删除该编码？"
        confirmLabel="确定"
        onConfirm={() => {
          if (deleteCode) {
            doDelete(deleteCode);
            setDeleteCode(null);
          }
        }}
        onCancel={() => setDeleteCode(null)}
      />
      <Toast
        message={toast?.message || ""}
        type={toast?.type as any}
        show={!!toast}
        onClose={closeToast}
      />

      <DetailModal open={!!detailModal?.open} title={`${detailModal?.name || ""} — 人员名单`} onClose={() => setDetailModal(null)}>
        {(() => {
          if (!detailModal) return null;
          const list = getDetailList({ code: detailModal.code, name: detailModal.name });
          if (list.length === 0) return <p className="text-sm text-gray-500">暂无人员</p>;
          return (
            <table className="w-full text-xs">
              <thead className="border-b bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">姓名</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">部门</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">岗位</th>
                </tr>
              </thead>
              <tbody>
                {list.map((emp) => (
                  <tr key={emp.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-700">{emp.name}</td>
                    <td className="px-3 py-2 text-gray-700">{emp.dept1 || "-"}</td>
                    <td className="px-3 py-2 text-gray-700">{emp.position || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          );
        })()}
      </DetailModal>

      <DetailModal open={!!positionDeptModal?.open} title={`${positionDeptModal?.name || ""} — 所属部门`} onClose={() => setPositionDeptModal(null)} maxWidth="max-w-md">
        {positionDeptModal && positionDeptModal.departments.length === 0 ? (
          <p className="text-sm text-gray-500">暂无关联部门</p>
        ) : (
          <ul className="space-y-2">
            {positionDeptModal?.departments.map((dept) => (
              <li key={dept} className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">{dept}</li>
            ))}
          </ul>
        )}
      </DetailModal>
      <AuditLogModal open={showHistory} onClose={() => setShowHistory(false)} entityType={entityType} />
    </div>
  );
}
