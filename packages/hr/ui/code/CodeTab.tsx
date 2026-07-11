"use client";

import { workspacePath } from "@workspace/core/routing";
import { useState, useEffect } from "react";
import AuditLogModal from "@workspace/platform/ui/AuditLogModal";
import { type DataSurfaceCommandSpec } from "@workspace/core/ui";
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
          apiPath="/api/modules/hr/roster/department-codes"
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
          apiPath="/api/modules/hr/roster/position-codes"
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
  const tableActions: DataSurfaceCommandSpec[] = editMode ? [
    {
      key: "save",
      label: saving ? "保存中..." : "保存",
      variant: "primary",
      disabled: saving,
      onClick: () => void handleSave(),
    },
    {
      key: "cancel",
      label: "取消",
      onClick: () => {
        setEditRow(null);
        setEditMode(false);
      },
    },
  ] : [
    {
      key: "edit",
      label: "编辑",
      disabled: !hrCanEdit(user),
      onClick: () => setEditMode(true),
    },
    {
      key: "history",
      label: "最近改动",
      disabled: !hrCanEdit(user),
      onClick: () => setShowHistory(true),
    },
  ];

  return (
    <div className="space-y-4">
      <CodeTable
        framed
        title={title}
        actions={hrCanAccess(user, "hr.roster") ? tableActions : undefined}
        loading={loading}
        emptyText="加载中..."
        bodyClassName="overflow-x-auto"
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

      <AuditLogModal
        open={showHistory}
        onClose={() => setShowHistory(false)}
        entityType={entityType}
        onRestored={() => window.location.reload()}
      />
    </div>
  );
}
