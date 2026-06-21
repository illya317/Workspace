"use client";

import { workspacePath } from "@workspace/core/routing";
import { useState, useEffect } from "react";
import EditToolbar from "@workspace/core/ui/EditToolbar";
import AuditLogModal from "@workspace/platform/ui/AuditLogModal";
import Toast from "@workspace/core/ui/Toast";
import { ActionToolbar, EmptyStateCard, PanelCard } from "@workspace/core/ui";
import { useCodeTab } from "./useCodeTab";
import CodeTable from "./CodeTable";

import { type HRUser as User, hrCanAccess, hrCanEdit } from "@workspace/hr/types";

export function CodesTab({
  user,
  selectedCompany,
}: {
  user: User;
  selectedCompany: string;
}) {
  const [companyCode, setCompanyCode] = useState("");
  const [selectedDept, setSelectedDept] = useState<string | null>(null);

  useEffect(() => {
    fetch(workspacePath("/api/modules/hr/roster/companies?active=1"))
      .then((r) => r.json())
      .then((data) => {
        const found = (data.companies || []).find(
          (c: { name: string; code: string }) => c.name === selectedCompany
        );
        if (found) setCompanyCode(found.code);
      });
  }, [selectedCompany]);

  return (
    <div className="flex gap-6">
      <div className="w-1/2">
        <CodeTab
          user={user}
          type="department"
          apiPath="/api/settings/governance/department-codes"
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
          apiPath="/api/settings/governance/position-codes"
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
    stats,
    loading,
    toast,
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
      <ActionToolbar
        className="border-0 bg-transparent p-0 shadow-none"
        leftSlot={title}
        rightSlot={hrCanAccess(user, "hr.roster") ? (
          <EditToolbar
            editMode={editMode}
            onStartEdit={() => setEditMode(true)}
            onSave={handleSave}
            onCancel={() => {
              setEditRow(null);
              setEditMode(false);
            }}
            canEdit={hrCanEdit(user)}
            onShowHistory={() => setShowHistory(true)}
            saving={saving}
          />
        ) : null}
      />

      <PanelCard className="overflow-hidden" bodyClassName="overflow-x-auto">
        {loading ? (
          <EmptyStateCard compact>加载中...</EmptyStateCard>
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
      </PanelCard>

      <Toast
        message={toast?.message || ""}
        type={toast?.type}
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
