"use client";

import { useMemo, type Dispatch, type SetStateAction } from "react";
import {
  createPageBody,
  createPageTabBar,
  createMessageSection,
  PageSurface,
  type SurfaceToolbarActionGroupActionSpec,
  type SurfaceToolbarItems,
} from "@workspace/core/ui";
import { employeeFields, withTenantProfileFieldOptions } from "@workspace/hr/constants";
import { useTenantConfig } from "@workspace/platform/ui/tenant-config";
import type {
  ContractRow,
  EdpRow,
  EmployeeProfile,
  EmployeeProfileEmployee,
  EmploymentRow,
  ProfileField,
} from "@workspace/hr/types";
import type { ReferenceOption } from "@workspace/core/ui";
import { createSectionShellSection } from "./ProfileFormControls";
import {
  createHistorySection,
  type ProfileHistoryEntry,
  useEdpSections,
  useEmploymentSections,
} from "./EmployeeProfileSections";
import {
  createGroupedFieldSections,
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
  onAddContract,
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
  onAddContract: () => void;
  onEmployeeFieldChange: (key: string, value: unknown, option?: ReferenceOption) => void;
  onHistoryToggle: (id: number) => void;
  onHistoryRefresh: () => void;
  confirmDelete: (options: { message: string }) => Promise<boolean>;
}) {
  const tenantConfig = useTenantConfig();
  const resolvedEmployeeFields = useMemo(
    () => withTenantProfileFieldOptions(employeeFields, tenantConfig),
    [tenantConfig],
  );
  const activeEmploymentIndex = employments.findIndex((row) => row.isActive);
  const activeEmployment = employments[activeEmploymentIndex >= 0 ? activeEmploymentIndex : 0] ?? null;
  const sectionCardClassName = "border-sky-200 bg-sky-100/30 shadow-none";
  const getEmployeeFields = (keys: string[]) => keys
    .map((key) => resolvedEmployeeFields.find((field) => field.key === key))
    .filter(Boolean) as ProfileField[];
  const employeeFieldGroups = [
    { title: "身份", fields: getEmployeeFields(["employeeId", "name", "alias", "gender", "birthDate", "lunarBirthday", "ethnicity", "hometown", "politics"]) },
    { title: "教育与职业", fields: getEmployeeFields(["education", "title", "school", "major", "workStartDate"]) },
    { title: "联系与账号", fields: getEmployeeFields(["phone", "idNumber", "otherId", "userId"]) },
  ];
  const profileTabs = [
    { key: "basic", label: "基本信息" },
    { key: "employment", label: "雇佣关系" },
    { key: "edp", label: "部门岗位" },
    { key: "history", label: "历史记录" },
  ];

  const toolbarActions: SurfaceToolbarActionGroupActionSpec[] = [];

  if (canEdit && activeSection !== "history") {
    toolbarActions.push({
      key: "save",
      kind: "save",
      label: saving === "all" ? "保存中..." : "保存",
      variant: "primary",
      disabled: saving !== null || !dirtyState.all,
      onClick: () => void onSaveAll(),
    });
  }

  toolbarActions.push({
    key: "back",
    kind: "back",
    label: "返回列表",
    variant: "secondary",
    onClick: onBack,
  });

  const toolbarItems: SurfaceToolbarItems = [{
    kind: "action-group",
    key: "profile-actions",
    actions: toolbarActions,
  }];

  const employmentSections = useEmploymentSections({
    employment: activeEmployment,
    canEdit,
    saving,
    onChange: (field, value, option) => setEmployments((rows) => changeEmployment(rows, activeEmploymentIndex, field, value, option)),
    contracts,
    className: sectionCardClassName,
    onAddContract,
    onChangeContract: (index, field, value, option) => setContracts((rows) => changeContract(rows, index, field, value, option)),
    onDeleteContract: (row, index) => removeRow(row.company, "合同记录", index, setContracts, confirmDelete),
  });
  const edpSections = useEdpSections({
    rows: edps,
    canEdit,
    saving,
    onAdd: () => {
      if (!profile) return;
      setEdps((rows) => [newEdp(profile), ...rows]);
    },
    className: sectionCardClassName,
    onChange: (index, field, value, option) => setEdps((rows) => updateProfileRow(rows, index, field, value, option) as EdpRow[]),
    onDelete: async (row, index) => {
      if (!row.isNew) {
        setError("已保存的任职期间不能删除；请通过生命周期变更或结束日期保留历史。");
        return;
      }
      const ok = await confirmDelete({ message: `确定删除这条岗位记录${row.positionName ? `（${row.positionName}）` : ""}吗？` });
      if (!ok) return;
      setError(null);
      setEdps((rows) => {
        const nextRows = rows.filter((_, i) => i !== index);
        if (nextRows.length > 0) return nextRows;
        return profile ? [newEdp(profile)] : [];
      });
    },
  });
  const createHistorySections = [
    createHistorySection({
      entries: historyEntries,
      loading: historyLoading,
      expandedId: expandedHistoryId,
      onToggle: onHistoryToggle,
      onRefresh: onHistoryRefresh,
      className: sectionCardClassName,
    }, tenantConfig.localization.businessTimeZone),
  ];
  const ready = !loading && Boolean(profile && employeeDraft);

  const basicSections = ready ? [
    createSectionShellSection({
      title: null,
      className: sectionCardClassName,
      sections: createGroupedFieldSections(employeeFieldGroups, employeeDraft as unknown as EditableRecord, !canEdit, onEmployeeFieldChange),
    }),
  ] : [];
  const activeSections =
    !ready
      ? []
      : activeSection === "basic"
      ? basicSections
      : activeSection === "employment"
        ? employmentSections
        : activeSection === "edp"
          ? edpSections
          : createHistorySections;

  return (
    <PageSurface kind="standard"
      tabbar={ready ? createPageTabBar({
        items: profileTabs,
        active: activeSection,
        onChange: (key) => onSectionChange(key as ProfileSection),
      }) : undefined}
      toolbar={ready ? { items: toolbarItems } : undefined}
      body={createPageBody(
        ready ? [
          ...(error ? [createMessageSection("error", { tone: "danger" as const, content: error })] : []),
          ...(message ? [createMessageSection("message", { content: message })] : []),
          ...activeSections,
        ] : [],
        {
          empty: !ready ? { content: loading ? "加载员工资料..." : error || "员工资料不存在", compact: true } : undefined,
        },
      )}
    />
  );
}

function changeEmployment(rows: EmploymentRow[], activeIndex: number, field: ProfileField, value: unknown, option?: ReferenceOption) {
  const index = activeIndex >= 0 ? activeIndex : 0;
  if (index < 0) return rows;
  const nextRows = updateProfileRow(rows, index, field, value, option) as EmploymentRow[];
  if (field.key !== "isActive" || value !== true) return nextRows;
  return nextRows.map((row, rowIndex) => rowIndex === index ? { ...row, leaveDate: null, leaveReason: null, leaveNote: null } : row);
}

function changeContract(rows: ContractRow[], index: number, field: ProfileField, value: unknown, option?: ReferenceOption) {
  const nextRows = updateProfileRow(rows, index, field, value, option) as ContractRow[];
  if (field.key !== "isPrimary" || value !== true) return nextRows;
  return nextRows.map((row, rowIndex) => rowIndex === index ? row : { ...row, isPrimary: false });
}

async function removeRow<T>(name: string | null | undefined, label: string, index: number, setRows: Dispatch<SetStateAction<T[]>>, confirmDelete: (options: { message: string }) => Promise<boolean>) {
  const ok = await confirmDelete({ message: `确定删除这条${label}${name ? `（${name}）` : ""}吗？` });
  if (ok) setRows((rows) => rows.filter((_, i) => i !== index));
}

function newEdp(profile: EmployeeProfile): EdpRow {
  return {
    employeeId: profile.employee.id,
    reportingCompanyId: profile.summary.reportingCompanyId,
    reportingCompanyName: profile.summary.reportingCompanyName,
    departmentId: null,
    departmentName: null,
    departmentPath: null,
    positionId: null,
    positionReportOverrideId: null,
    positionName: null,
    isPrimary: false,
    startDate: null,
    endDate: null,
    reportTo: null,
    reportToPositionId: null,
    workPercent: null,
    isNew: true,
  };
}
