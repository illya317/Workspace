"use client";

import type { Dispatch, SetStateAction } from "react";
import {
  ActionToolbar,
  AccordionTabBar,
  EmptyStateCard,
} from "@workspace/core/ui";
import { DatabasePageFrame } from "@workspace/core/ui";
import { employeeFields } from "@workspace/hr/constants";
import type {
  ContractRow,
  EdpRow,
  EmployeeProfile,
  EmployeeProfileEmployee,
  EmploymentRow,
  ProfileField,
} from "@workspace/hr/types";
import type { FkFieldOption } from "@workspace/core/ui";
import { SectionShell } from "./ProfileFormControls";
import {
  EdpSection,
  EmploymentSection,
  HistorySection,
  type ProfileHistoryEntry,
} from "./EmployeeProfileSections";
import {
  groupedFieldGrid,
  updateProfileRow,
  type EditableRecord,
} from "./EmployeeProfileUtils";

type ProfileSection = "basic" | "employment" | "edp" | "history";

export interface EmployeeProfileDirtyState {
  basic: boolean;
  employment: boolean;
  edp: boolean;
  all: boolean;
}

export default function EmployeeProfileView({
  loading,
  profile,
  employeeDraft,
  error,
  message,
  canEdit,
  saving,
  activeSection,
  onSectionChange,
  dirtyState,
  employments,
  contracts,
  edps,
  historyEntries,
  historyLoading,
  expandedHistoryId,
  setEmployments,
  setContracts,
  setEdps,
  setError,
  onBack,
  onSaveAll,
  onEmployeeFieldChange,
  onHistoryToggle,
  onHistoryRefresh,
  confirmDelete,
}: {
  loading: boolean;
  profile: EmployeeProfile | null;
  employeeDraft: EmployeeProfileEmployee | null;
  error: string | null;
  message: string | null;
  canEdit: boolean;
  saving: string | null;
  activeSection: ProfileSection;
  onSectionChange: (section: ProfileSection) => void;
  dirtyState: EmployeeProfileDirtyState;
  employments: EmploymentRow[];
  contracts: ContractRow[];
  edps: EdpRow[];
  historyEntries: ProfileHistoryEntry[];
  historyLoading: boolean;
  expandedHistoryId: number | null;
  setEmployments: Dispatch<SetStateAction<EmploymentRow[]>>;
  setContracts: Dispatch<SetStateAction<ContractRow[]>>;
  setEdps: Dispatch<SetStateAction<EdpRow[]>>;
  setError: (message: string | null) => void;
  onBack: () => void;
  onSaveAll: () => Promise<void>;
  onEmployeeFieldChange: (key: string, value: unknown, option?: FkFieldOption) => void;
  onHistoryToggle: (id: number) => void;
  onHistoryRefresh: () => void;
  confirmDelete: (options: { message: string }) => Promise<boolean>;
}) {
  if (loading) return <DatabasePageFrame><EmptyStateCard>加载员工资料...</EmptyStateCard></DatabasePageFrame>;
  if (!profile || !employeeDraft) {
    return <DatabasePageFrame><EmptyStateCard compact>{error || "员工资料不存在"}</EmptyStateCard></DatabasePageFrame>;
  }

  const activeEmploymentIndex = employments.findIndex((row) => row.isActive);
  const activeEmployment = employments[activeEmploymentIndex >= 0 ? activeEmploymentIndex : 0] ?? null;
  const sectionCardClassName = "rounded-t-none border-t-0 border-sky-200 bg-sky-100/30 shadow-none";
  const getEmployeeFields = (keys: string[]) => keys
    .map((key) => employeeFields.find((field) => field.key === key))
    .filter(Boolean) as ProfileField[];
  const employeeFieldGroups = [
    { title: "身份", fields: getEmployeeFields(["employeeId", "name", "alias", "gender", "birthDate", "lunarBirthday", "ethnicity", "hometown", "politics"]) },
    { title: "教育与职业", fields: getEmployeeFields(["education", "title", "school", "major", "workStartDate"]) },
    { title: "联系与账号", fields: getEmployeeFields(["phone", "idNumber", "otherId", "userId"]) },
  ];
  const profileTabs = (
    <AccordionTabBar
      tabs={[
        { key: "basic", label: "基本信息" },
        { key: "employment", label: "雇佣关系" },
        { key: "edp", label: "部门岗位" },
        { key: "history", label: "历史记录" },
      ]}
      activeTab={activeSection}
      onTabChange={(key) => onSectionChange(key as ProfileSection)}
      className="border-0 bg-transparent p-0 shadow-none"
    />
  );

  return (
    <DatabasePageFrame>
      <ActionToolbar
        className="sticky top-[52px] z-20 mb-0 rounded-b-none border-sky-200 border-b-0 bg-sky-100/30 shadow-none"
        leftSlot={profileTabs}
        primaryActions={canEdit && activeSection !== "history" ? [{
          label: saving === "all" ? "保存中..." : "保存",
          disabled: saving !== null || !dirtyState.all,
          onClick: onSaveAll,
        }] : []}
        secondaryActions={[{ label: "返回列表", onClick: onBack }]}
      />

      {error && <EmptyStateCard compact>{error}</EmptyStateCard>}
      {message && <EmptyStateCard compact>{message}</EmptyStateCard>}

      <div>
        {activeSection === "basic" && (
          <SectionShell title={null} className={sectionCardClassName}>
            {groupedFieldGrid(employeeFieldGroups, employeeDraft as unknown as EditableRecord, !canEdit, onEmployeeFieldChange)}
          </SectionShell>
        )}

        {activeSection === "employment" && (
          <EmploymentSection
            employment={activeEmployment}
            canEdit={canEdit}
            saving={saving}
            onChange={(field, value, option) => setEmployments((rows) => changeEmployment(rows, activeEmploymentIndex, field, value, option))}
            contracts={contracts}
            className={sectionCardClassName}
            onAddContract={() => setContracts((rows) => [newContract(profile, employments), ...rows])}
            onChangeContract={(index, field, value, option) => setContracts((rows) => changeContract(rows, index, field, value, option))}
            onDeleteContract={(row, index) => removeRow(row.company, "合同记录", index, setContracts, confirmDelete)}
          />
        )}

        {activeSection === "edp" && (
          <EdpSection
            rows={edps}
            canEdit={canEdit}
            saving={saving}
            onAdd={() => setEdps((rows) => [newEdp(profile), ...rows])}
            className={sectionCardClassName}
            onChange={(index, field, value, option) => setEdps((rows) => updateProfileRow(rows, index, field, value, option) as EdpRow[])}
            onDelete={async (row, index) => {
              const ok = await confirmDelete({ message: `确定删除这条岗位记录${row.positionName ? `（${row.positionName}）` : ""}吗？` });
              if (!ok) return;
              setError(null);
              setEdps((rows) => rows.filter((_, i) => i !== index));
            }}
          />
        )}

        {activeSection === "history" && (
          <HistorySection entries={historyEntries} loading={historyLoading} expandedId={expandedHistoryId} onToggle={onHistoryToggle} onRefresh={onHistoryRefresh} className={sectionCardClassName} />
        )}
      </div>
    </DatabasePageFrame>
  );
}

function changeEmployment(rows: EmploymentRow[], activeIndex: number, field: ProfileField, value: unknown, option?: FkFieldOption) {
  const index = activeIndex >= 0 ? activeIndex : 0;
  if (index < 0) return rows;
  const nextRows = updateProfileRow(rows, index, field, value, option) as EmploymentRow[];
  if (field.key !== "isActive" || value !== true) return nextRows;
  return nextRows.map((row, rowIndex) => rowIndex === index ? { ...row, leaveDate: null, leaveReason: null, leaveNote: null } : row);
}

function changeContract(rows: ContractRow[], index: number, field: ProfileField, value: unknown, option?: FkFieldOption) {
  const nextRows = updateProfileRow(rows, index, field, value, option) as ContractRow[];
  if (field.key !== "isPrimary" || value !== true) return nextRows;
  return nextRows.map((row, rowIndex) => rowIndex === index ? row : { ...row, isPrimary: false });
}

async function removeRow<T>(name: string | null | undefined, label: string, index: number, setRows: Dispatch<SetStateAction<T[]>>, confirmDelete: (options: { message: string }) => Promise<boolean>) {
  const ok = await confirmDelete({ message: `确定删除这条${label}${name ? `（${name}）` : ""}吗？` });
  if (ok) setRows((rows) => rows.filter((_, i) => i !== index));
}

function newContract(profile: EmployeeProfile, employments: EmploymentRow[]): ContractRow {
  return {
    employmentId: employments.find((row) => row.isActive)?.id ?? employments[0]?.id,
    employeeId: profile.employee.employeeId,
    employeeName: profile.employee.name,
    company: profile.summary.currentCompany || "",
    isPrimary: false,
    isInsuredHere: false,
    insuranceStatus: null,
    legalRelation: "",
    contractType: "",
    employmentForm: "",
    firstContractStartDate: null,
    firstContractEndDate: null,
    secondContractStartDate: null,
    secondContractEndDate: null,
    thirdContractStartDate: null,
    thirdContractEndDate: null,
    permanentContractDate: null,
    confidentialityDate: null,
    nonCompeteDate: null,
    endDate: null,
    isNew: true,
  };
}

function newEdp(profile: EmployeeProfile): EdpRow {
  return {
    employeeId: profile.employee.id,
    departmentId: null,
    departmentName: null,
    positionId: null,
    positionName: null,
    isPrimary: false,
    startDate: null,
    endDate: null,
    reportTo: null,
    workPercent: null,
    isNew: true,
  };
}
