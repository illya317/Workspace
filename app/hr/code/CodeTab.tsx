"use client";

import { useState } from "react";
import EditToolbar from "@/app/components/EditToolbar";
import AuditLogModal from "@/app/components/AuditLogModal";
import Toast from "@/app/components/Toast";
import { NAME_TO_CODE } from "@/lib/company";
import { useCodeTab } from "@/app/hr/code/useCodeTab";
import CodeTable from "@/app/hr/code/CodeTable";

import type { HRUser as User } from "@/app/hr/types";

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
          <CodeTable
            sortedCodes={sortedCodes}
            stats={stats}
            sortField={sortField}
            sortDirection={sortDirection}
            toggleSort={toggleSort}
            editMode={editMode}
            editRow={editRow}
            editCodeValue={editCodeValue}
            setEditCodeValue={setEditCodeValue}
            editNameValue={editNameValue}
            setEditNameValue={setEditNameValue}
            newCode={newCode}
            setNewCode={setNewCode}
            newName={newName}
            setNewName={setNewName}
            startEditRow={startEditRow}
            handleAdd={handleAdd}
            onSelect={onSelect}
            selectedCode={selectedCode}
            detailModal={detailModal}
            setDetailModal={setDetailModal}
            positionDeptModal={positionDeptModal}
            setPositionDeptModal={setPositionDeptModal}
            getDetailList={getDetailList}
            loadPositionDepts={loadPositionDepts}
            user={user}
            type={type}
          />
        )}
      </div>

      <Toast
        message={toast?.message || ""}
        type={toast?.type as any}
        show={!!toast}
        onClose={closeToast}
      />

      <AuditLogModal
        open={showHistory}
        onClose={() => setShowHistory(false)}
        entityType={entityType}
        onRestored={() => window.location.reload()}
      />
    </div>
  );
}
