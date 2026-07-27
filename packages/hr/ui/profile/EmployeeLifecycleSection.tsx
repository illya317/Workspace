"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createFieldsSection,
  createListSection,
  createMessageSection,
  createPanelSection,
  type BodySurfaceSectionSpec,
  type FormSurfaceItemSpec,
  type ReferenceOption,
  useFeedback,
} from "@workspace/core/ui";
import { edpFields, employmentFields, withTenantProfileFieldOptions } from "@workspace/hr/constants";
import { isEmploymentPositionOptionalTitle } from "@workspace/hr/constants/employee-temporal-write-policy";
import type {
  EdpRow,
  EmployeeLifecycleEventRow,
  EmployeeLifecycleEventType,
  EmployeeProfile,
  ProfileField,
} from "@workspace/hr/types";
import { requestJson } from "@workspace/platform/ui/api-client";
import { inclusiveBusinessPeriodContains } from "@workspace/platform/contracts/business-temporal";
import { useTenantConfig } from "@workspace/platform/ui/tenant-config";
import { profileFieldSpec } from "./EmployeeProfileFieldSpecs";
import { updateProfileRow, type EditableRecord } from "./EmployeeProfileUtils";

const EVENT_OPTIONS: Array<{ value: EmployeeLifecycleEventType; label: string }> = [
  { value: "onboard", label: "入职" },
  { value: "transfer", label: "调岗" },
  { value: "concurrent_assignment", label: "兼岗" },
  { value: "reporting_change", label: "汇报关系变化" },
  { value: "offboard", label: "离职" },
];

type LifecycleDraft = EditableRecord & {
  eventType: EmployeeLifecycleEventType;
  effectiveDate: string;
  reason: string | null;
  sourceAssignmentId: number | null;
  assignmentEndDate: string | null;
  reportingCompanyId: number | null;
  reportingCompanyName: string | null;
  departmentId: number | null;
  departmentName: string | null;
  departmentPath: string | null;
  positionId: number | null;
  positionName: string | null;
  positionReportOverrideId: number | null;
  reportToPositionId: number | null;
  reportTo: string | null;
  workPercent: string | null;
  officeLocation: string | null;
  personnelType: string | null;
  rank: string | null;
  title: string | null;
  leaveReason: string | null;
  leaveNote: string | null;
};

function businessDate(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function eligibleSources(profile: EmployeeProfile | null, date: string) {
  return (profile?.edps ?? []).filter((row) => row.id && inclusiveBusinessPeriodContains({
    validFrom: row.startDate,
    validThrough: row.endDate,
  }, date) && (!row.startDate || row.startDate < date));
}

function applySource(draft: LifecycleDraft, source: EdpRow | null): LifecycleDraft {
  if (!source) return { ...draft, sourceAssignmentId: null };
  return {
    ...draft,
    sourceAssignmentId: source.id ?? null,
    reportingCompanyId: source.reportingCompanyId,
    reportingCompanyName: source.reportingCompanyName ?? null,
    departmentId: source.departmentId,
    departmentName: source.departmentName,
    departmentPath: source.departmentPath,
    positionId: source.positionId,
    positionName: source.positionName,
    positionReportOverrideId: source.positionReportOverrideId ?? null,
    reportToPositionId: source.reportToPositionId,
    reportTo: source.reportTo,
    workPercent: source.workPercent,
  };
}

function initialDraft(profile: EmployeeProfile | null, date: string): LifecycleDraft {
  const source = eligibleSources(profile, date).find((row) => row.isPrimary) ?? eligibleSources(profile, date)[0] ?? null;
  return applySource({
    eventType: source ? "transfer" : "onboard",
    effectiveDate: date,
    reason: null,
    sourceAssignmentId: null,
    assignmentEndDate: null,
    reportingCompanyId: profile?.summary.reportingCompanyId ?? null,
    reportingCompanyName: profile?.summary.reportingCompanyName ?? null,
    departmentId: profile?.summary.departmentId ?? null,
    departmentName: profile?.summary.departmentName ?? null,
    departmentPath: profile?.summary.departmentPath ?? null,
    positionId: profile?.summary.positionId ?? null,
    positionName: profile?.summary.positionName ?? null,
    positionReportOverrideId: null,
    reportToPositionId: null,
    reportTo: null,
    workPercent: "1",
    officeLocation: null,
    personnelType: null,
    rank: null,
    title: null,
    leaveReason: null,
    leaveNote: null,
  }, source);
}

function eventLabel(type: EmployeeLifecycleEventType) {
  return EVENT_OPTIONS.find((option) => option.value === type)?.label ?? type;
}

function lifecycleEventBadges(event: EmployeeLifecycleEventRow) {
  const confirmed = event.recordState === "confirmed";
  const temporalBadge = {
    key: `temporal-${event.temporalState}`,
    label: confirmed
      ? event.temporalState === "scheduled" ? "待生效" : "已生效"
      : event.temporalState === "scheduled" ? "原生效日未到" : "原生效日已到",
    tone: confirmed
      ? event.temporalState === "scheduled" ? "warning" as const : "success" as const
      : "muted" as const,
  };
  if (confirmed) return [temporalBadge];
  return [
    temporalBadge,
    {
      key: `record-${event.recordState}`,
      label: event.recordState === "cancelled" ? "推断已取消" : "记录状态未知",
      tone: "muted" as const,
    },
  ];
}

function periodLabel(row: EdpRow) {
  return `${row.positionName || "未命名岗位"} · ${row.departmentName || "未设置部门"} · ${row.startDate || "不限"} 至 ${row.endDate || "长期"}`;
}

export function useEmployeeLifecycleSections({
  profile,
  canEdit,
  onSaved,
}: {
  profile: EmployeeProfile | null;
  canEdit: boolean;
  onSaved: () => Promise<void>;
}): BodySurfaceSectionSpec[] {
  const tenantConfig = useTenantConfig();
  const today = profile?.asOfDate ?? businessDate(tenantConfig.localization.businessTimeZone);
  const [draft, setDraft] = useState<LifecycleDraft>(() => initialDraft(profile, today));
  const [saving, setSaving] = useState(false);
  const feedback = useFeedback();
  useEffect(() => {
    setDraft(initialDraft(profile, today));
  }, [profile, today]);
  const sourceRows = useMemo(
    () => eligibleSources(profile, draft.effectiveDate),
    [draft.effectiveDate, profile],
  );
  const resolvedEmploymentFields = useMemo(
    () => withTenantProfileFieldOptions(employmentFields, tenantConfig),
    [tenantConfig],
  );

  function setField(key: string, value: unknown, option?: ReferenceOption) {
    setDraft((current) => {
      if (key === "effectiveDate") {
        const effectiveDate = String(value ?? "");
        const currentSource = profile?.edps.find((row) => row.id === current.sourceAssignmentId) ?? null;
        const source = currentSource && eligibleSources(profile, effectiveDate).some((row) => row.id === currentSource.id)
          ? currentSource
          : eligibleSources(profile, effectiveDate).find((row) => row.isPrimary) ?? eligibleSources(profile, effectiveDate)[0] ?? null;
        return current.eventType === "onboard" || current.eventType === "offboard"
          ? { ...current, effectiveDate }
          : applySource({ ...current, effectiveDate }, source);
      }
      if (key === "sourceAssignmentId") {
        const source = profile?.edps.find((row) => row.id === Number(value)) ?? null;
        return applySource(current, source);
      }
      const field = [...edpFields, ...resolvedEmploymentFields, lifecycleTextField].find((item) => item.key === key);
      if (!field) return { ...current, [key]: value };
      return updateProfileRow([current], 0, field, value, option)[0] as LifecycleDraft;
    });
  }

  function changeEventType(eventType: EmployeeLifecycleEventType) {
    setDraft((current) => {
      const source = eligibleSources(profile, current.effectiveDate).find((row) => row.isPrimary)
        ?? eligibleSources(profile, current.effectiveDate)[0]
        ?? null;
      const base = { ...current, eventType, assignmentEndDate: null, leaveReason: null, leaveNote: null };
      if (eventType === "onboard") {
        return { ...base, sourceAssignmentId: null, workPercent: "1", reportToPositionId: null, reportTo: null };
      }
      if (eventType === "offboard") return { ...base, sourceAssignmentId: null };
      return applySource(base, source);
    });
  }

  async function save() {
    if (!profile) return;
    setSaving(true);
    try {
      await requestJson(`/api/modules/hr/roster/employee-profiles/${profile.employee.id}/lifecycle`, {
        method: "PUT",
        body: JSON.stringify(draft),
        fallbackMessage: "人员生命周期变更保存失败",
      });
      feedback.success(`${eventLabel(draft.eventType)}已登记，生效日为 ${draft.effectiveDate}`);
      await onSaved();
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "人员生命周期变更保存失败");
    } finally {
      setSaving(false);
    }
  }

  const commonItems: FormSurfaceItemSpec[] = [
    {
      key: "eventType",
      label: "变更类型",
      required: true,
      spec: {
        valueType: "string",
        control: "choice",
        state: canEdit ? "normal" : "disabled",
        options: { source: "static", items: EVENT_OPTIONS, visibleCount: 5 },
      },
      value: draft.eventType,
      onChange: (value) => changeEventType(String(value) as EmployeeLifecycleEventType),
    },
    {
      key: "effectiveDate",
      label: "生效日期",
      required: true,
      spec: { valueType: "date", control: "temporal", precision: "date", state: canEdit ? "normal" : "disabled" },
      value: draft.effectiveDate,
      onChange: (value) => setField("effectiveDate", value),
    },
  ];

  const sourceItem: FormSurfaceItemSpec = {
    key: "sourceAssignmentId",
    label: "来源岗位",
    required: true,
    spec: {
      valueType: "number",
      control: "choice",
      state: canEdit && sourceRows.length > 0 ? "normal" : "disabled",
      options: {
        source: "static",
        items: sourceRows.map((row) => ({ value: String(row.id), label: periodLabel(row) })),
        visibleCount: 5,
      },
    },
    value: draft.sourceAssignmentId == null ? "" : String(draft.sourceAssignmentId),
    placeholder: sourceRows.length > 0 ? "选择来源岗位" : "生效日没有可变更岗位",
    onChange: (value) => setField("sourceAssignmentId", value),
  };

  const fieldByKey = (fields: ProfileField[], key: string) => fields.find((field) => field.key === key)!;
  const targetFields = ["reportingCompanyId", "departmentId", "positionId"]
    .map((key) => fieldByKey(edpFields, key));
  const employmentKeys = ["personnelType", "rank", "title", "officeLocation"];
  const targetItems = targetFields.map((field) => profileFieldSpec(field, draft, !canEdit, setField));
  const employmentItems = employmentKeys.map((key) => profileFieldSpec(fieldByKey(resolvedEmploymentFields, key), draft, !canEdit, setField));
  const percentItem = profileFieldSpec(fieldByKey(edpFields, "workPercent"), draft, !canEdit, setField);
  const reasonItem = profileFieldSpec(lifecycleTextField, draft, !canEdit, setField);
  const requiredLeaveReasonField = {
    ...fieldByKey(resolvedEmploymentFields, "leaveReason"),
    required: true,
  };
  const positionOptionalOnboard = draft.eventType === "onboard"
    && isEmploymentPositionOptionalTitle(draft.title);

  const eventItems: FormSurfaceItemSpec[] = draft.eventType === "onboard"
    ? [...(positionOptionalOnboard ? [] : [...targetItems, percentItem]), ...employmentItems]
    : draft.eventType === "transfer"
      ? [sourceItem, ...targetItems]
      : draft.eventType === "concurrent_assignment"
        ? [sourceItem, ...targetItems, percentItem, profileFieldSpec(assignmentEndField, draft, !canEdit, setField)]
        : draft.eventType === "reporting_change"
          ? [sourceItem, profileFieldSpec(fieldByKey(edpFields, "reportToPositionId"), draft, !canEdit, setField)]
          : [
              profileFieldSpec(requiredLeaveReasonField, draft, !canEdit, setField),
              profileFieldSpec(fieldByKey(resolvedEmploymentFields, "leaveNote"), draft, !canEdit, setField),
            ];

  return [
    createMessageSection("lifecycle-guidance", {
      content: "生效日当天启用新状态；旧任职、旧汇报关系和离职前雇佣期间会自动截止到前一天。未来变更可提前登记。",
    }),
    createPanelSection("lifecycle-editor", {
      sections: [createFieldsSection("lifecycle-fields", [...commonItems, ...eventItems, reasonItem], {
        header: { title: "登记生命周期变更" },
        layout: { columns: 2 },
        actions: canEdit ? [{
          key: "save-lifecycle",
          action: "save",
          label: saving ? "登记中..." : "登记变更",
          disabled: saving || !draft.effectiveDate,
          onClick: () => void save(),
        }] : [],
      })],
    }),
    createPanelSection("lifecycle-history", {
      title: "生命周期台账",
      sections: [createListSection("lifecycle-event-list", {
        density: "compact",
        empty: { content: "暂无生命周期事件", compact: true },
        items: (profile?.lifecycleEvents ?? []).map((event) => ({
          key: event.id,
          title: `${eventLabel(event.eventType)} · ${event.effectiveDate}`,
          description: event.reason || "未填写变更说明",
          meta: `${event.recordedByName} · 登记于 ${new Intl.DateTimeFormat("zh-CN", { timeZone: tenantConfig.localization.businessTimeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(event.recordedAt))}`,
          badges: lifecycleEventBadges(event),
        })),
      })],
    }),
  ];
}

const assignmentEndField: ProfileField = {
  key: "assignmentEndDate",
  label: "兼岗结束日期",
  type: "date",
};

const lifecycleTextField: ProfileField = {
  key: "reason",
  label: "变更说明",
  type: "textarea",
  span: "wide",
};
