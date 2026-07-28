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
import { preferredEmployment } from "@workspace/hr/utils/employment-selection";
import type {
  ContractRow,
  EdpRow,
  EmployeeSocialInsuranceRow,
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
import { useEmployeeLifecycleSections } from "./EmployeeLifecycleSection";
import { useEmployeeSocialInsuranceSections } from "./EmployeeSocialInsuranceSection";

export type EmployeeProfileSection = "basic" | "employment" | "socialInsurance" | "assignment" | "history";

export interface EmployeeProfileDirtyState {
  basic: boolean;
  employment: boolean;
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
  socialInsurancePeriods,
  edps,
  historyEntries,
  historyLoading,
  expandedHistoryId,
  setEmployments,
  onBack,
  onSaveAll,
  onEmployeeFieldChange,
  onHistoryToggle,
  onHistoryRefresh,
  onLifecycleSaved,
  onAgreementSaved,
  onSocialInsuranceSaved,
}: {
  loading: boolean;
  profile: EmployeeProfile | null;
  employeeDraft: EmployeeProfileEmployee | null;
  error: string | null;
  message: string | null;
  canEdit: boolean;
  saving: string | null;
  activeSection: EmployeeProfileSection;
  onSectionChange: (section: EmployeeProfileSection) => void;
  dirtyState: EmployeeProfileDirtyState;
  employments: EmploymentRow[];
  contracts: ContractRow[];
  socialInsurancePeriods: EmployeeSocialInsuranceRow[];
  edps: EdpRow[];
  historyEntries: ProfileHistoryEntry[];
  historyLoading: boolean;
  expandedHistoryId: string | number | null;
  setEmployments: Dispatch<SetStateAction<EmploymentRow[]>>;
  onBack: () => void;
  onSaveAll: () => Promise<void>;
  onEmployeeFieldChange: (key: string, value: unknown, option?: ReferenceOption) => void;
  onHistoryToggle: (id: string | number) => void;
  onHistoryRefresh: () => void;
  onLifecycleSaved: () => Promise<void>;
  onAgreementSaved: () => Promise<void>;
  onSocialInsuranceSaved: () => Promise<void>;
}) {
  const tenantConfig = useTenantConfig();
  const resolvedEmployeeFields = useMemo(
    () => withTenantProfileFieldOptions(employeeFields, tenantConfig),
    [tenantConfig],
  );
  const activeEmployment = preferredEmployment(employments);
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
    { key: "socialInsurance", label: "社会保险" },
    { key: "assignment", label: "任职管理" },
    { key: "history", label: "历史记录" },
  ];

  const toolbarActions: SurfaceToolbarActionGroupActionSpec[] = [];

  if (canEdit && (activeSection === "basic" || activeSection === "employment")) {
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
    employeeId: profile?.employee.id ?? 0,
    employments,
    asOfDate: profile?.asOfDate ?? "",
    canEdit,
    saving,
    onChange: (index, field, value, option) => setEmployments((rows) => changeEmployment(rows, index, field, value, option)),
    contracts,
    className: sectionCardClassName,
    onAgreementSaved,
  });
  const edpSections = useEdpSections({
    rows: edps,
    asOfDate: profile?.asOfDate ?? "",
    className: sectionCardClassName,
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
  const lifecycleSections = useEmployeeLifecycleSections({ profile, canEdit, onSaved: onLifecycleSaved });
  const assignmentSections = [...edpSections, ...lifecycleSections];
  const socialInsuranceSections = useEmployeeSocialInsuranceSections({
    employeeId: profile?.employee.id ?? 0,
    rows: socialInsurancePeriods,
    asOfDate: profile?.asOfDate ?? "",
    canEdit,
    onSaved: onSocialInsuranceSaved,
  });

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
        : activeSection === "socialInsurance"
          ? socialInsuranceSections
        : activeSection === "assignment"
          ? assignmentSections
          : createHistorySections;

  return (
    <PageSurface kind="standard"
      tabbar={ready ? createPageTabBar({
        items: profileTabs,
        active: activeSection,
        onChange: (key) => onSectionChange(key as EmployeeProfileSection),
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

function changeEmployment(rows: EmploymentRow[], index: number, field: ProfileField, value: unknown, option?: ReferenceOption) {
  if (index < 0) return rows;
  return updateProfileRow(rows, index, field, value, option) as EmploymentRow[];
}
