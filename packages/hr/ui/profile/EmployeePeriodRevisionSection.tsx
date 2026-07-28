"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createFieldsSection,
  createPanelSection,
  type BodySurfaceSectionSpec,
  type FormSurfaceItemSpec,
  type ReferenceOption,
  useFeedback,
} from "@workspace/core/ui";
import { edpFields } from "@workspace/hr/constants";
import type { EdpRow, EmployeeProfile, EmploymentRow, ProfileField } from "@workspace/hr/types";
import { requestJson } from "@workspace/platform/ui/api-client";
import { profileFieldSpec } from "./EmployeeProfileFieldSpecs";
import { updateProfileRow, type EditableRecord } from "./EmployeeProfileUtils";

type PeriodType = "Employment" | "EDP";

type PeriodTarget = {
  entityType: PeriodType;
  periodId: number;
  expectedVersion: number;
  label: string;
  startDate: string;
  endDate: string | null;
  currentCompany: string | null;
  reportingCompanyId: number | null;
  reportingCompanyName: string | null;
  departmentId: number | null;
  departmentName: string | null;
  departmentPath: string | null;
  positionId: number | null;
  positionName: string | null;
  isPrimary: boolean;
  allocationWeight: string | null;
  reportToPositionId: number | null;
  reportTo: string | null;
};

type PeriodRevisionDraft = PeriodTarget & { reason: string };

const EMPLOYMENT_COMPANY_FIELD: ProfileField = {
  key: "currentCompany",
  label: "用工公司",
  type: "fk",
  entity: "company",
  fkKey: "hr.company",
  valueFrom: "name",
};

const PERIOD_DATE_FIELDS: ProfileField[] = [
  { key: "startDate", label: "开始日期", type: "date", required: true },
  { key: "endDate", label: "结束日期", type: "date" },
];

export function useEmployeePeriodRevisionSections({
  profile,
  canRevise,
  entityTypes = ["Employment", "EDP"],
  title = "纠正历史记录",
  onSaved,
}: {
  profile: EmployeeProfile | null;
  canRevise: boolean;
  entityTypes?: PeriodType[];
  title?: string;
  onSaved: () => Promise<void>;
}): BodySurfaceSectionSpec[] {
  const includeEmployment = entityTypes.includes("Employment");
  const includeAssignment = entityTypes.includes("EDP");
  const targets = useMemo(
    () => periodTargets(profile).filter((target) => (
      target.entityType === "Employment" ? includeEmployment : includeAssignment
    )),
    [includeAssignment, includeEmployment, profile],
  );
  const [draft, setDraft] = useState<PeriodRevisionDraft | null>(() => toDraft(targets[0]));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const feedback = useFeedback();

  useEffect(() => {
    setDraft(toDraft(targets[0]));
    setEditing(false);
  }, [targets]);

  if (!canRevise || !draft) return [];
  const typeTargets = targets.filter((target) => target.entityType === draft.entityType);

  function selectType(entityType: PeriodType) {
    const target = targets.find((item) => item.entityType === entityType);
    setDraft(toDraft(target));
    setEditing(false);
  }

  function selectTarget(periodId: number) {
    setDraft(toDraft(typeTargets.find((target) => target.periodId === periodId)));
    setEditing(false);
  }

  function setField(key: string, value: unknown, option?: ReferenceOption) {
    setDraft((current) => {
      if (!current) return current;
      if (key === "reason") return { ...current, reason: String(value ?? "") };
      const field = [...PERIOD_DATE_FIELDS, EMPLOYMENT_COMPANY_FIELD, ...edpFields]
        .find((item) => item.key === key);
      if (!field) return current;
      const formRow = updateProfileRow<EditableRecord>(
        [current as unknown as EditableRecord],
        0,
        field,
        value,
        option,
      )[0];
      return formRow as unknown as PeriodRevisionDraft;
    });
  }

  async function save() {
    if (!profile || !draft) return;
    setSaving(true);
    try {
      const common = {
        entityType: draft.entityType,
        periodId: draft.periodId,
        expectedVersion: draft.expectedVersion,
        startDate: draft.startDate,
        endDate: draft.endDate,
        reason: draft.reason,
      };
      const command = draft.entityType === "Employment" ? {
        ...common,
        entityType: "Employment" as const,
        currentCompany: draft.currentCompany,
      } : {
        ...common,
        entityType: "EDP" as const,
        reportingCompanyId: draft.reportingCompanyId,
        departmentId: draft.departmentId,
        positionId: draft.positionId,
        isPrimary: draft.isPrimary,
        allocationWeight: draft.allocationWeight,
        reportToPositionId: draft.reportToPositionId,
      };
      await requestJson(`/api/modules/hr/roster/employee-profiles/${profile.employee.id}/period-revisions`, {
        method: "POST",
        body: JSON.stringify(command),
        fallbackMessage: "历史记录纠正失败",
      });
      feedback.success("历史记录已纠正，原值、修正值和原因已进入审计记录");
      setEditing(false);
      await onSaved();
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "历史记录纠正失败");
    } finally {
      setSaving(false);
    }
  }

  const selectorItems: FormSurfaceItemSpec[] = [
    ...(entityTypes.length > 1
      ? [choiceItem("entityType", "记录类型", draft.entityType, periodTypes(targets), (value) => selectType(value as PeriodType), saving)]
      : []),
    choiceItem(
      "periodId",
      draft.entityType === "Employment" ? "雇佣记录" : "任职记录",
      String(draft.periodId),
      typeTargets.map((target) => ({ value: String(target.periodId), label: target.label })),
      (value) => selectTarget(Number(value)),
      saving,
    ),
  ];
  const correctionItems = draft.entityType === "Employment"
    ? employmentCorrectionItems(draft, !editing || saving, setField)
    : assignmentCorrectionItems(draft, !editing || saving, setField);
  const reasonItem: FormSurfaceItemSpec = editing ? {
    key: "reason",
    label: "纠正原因",
    required: true,
    span: "wide",
    spec: { valueType: "string", control: "text", multiline: true, state: saving ? "disabled" : "required" },
    value: draft.reason,
    rows: 2,
    onChange: (value) => setField("reason", value),
  } : {
    kind: "note",
    key: "correction-guidance",
    content: "现实发生变化请使用新增变更；这里只纠正原记录中的录入错误，并永久保留修正前后值。",
  };
  const actions = editing ? [{
    key: "cancel-period-revision",
    action: "cancel" as const,
    label: "取消",
    disabled: saving,
    onClick: () => {
      setDraft(toDraft(targets.find((target) => target.periodId === draft.periodId && target.entityType === draft.entityType)));
      setEditing(false);
    },
  }, {
    key: "save-period-revision",
    action: "save" as const,
    label: saving ? "纠正中..." : "保存纠正",
    disabled: saving || !revisionReady(draft),
    onClick: () => void save(),
  }] : [{
    key: "start-period-revision",
    action: "edit" as const,
    label: "纠正这条记录",
    disabled: saving,
    onClick: () => setEditing(true),
  }];

  return [createPanelSection(`period-revision-${entityTypes.join("-").toLowerCase()}`, {
    sections: [createFieldsSection("period-revision-fields", [...selectorItems, ...correctionItems, reasonItem], {
      header: { title },
      layout: { columns: 2 },
      actions,
    })],
  })];
}

function employmentCorrectionItems(
  draft: PeriodRevisionDraft,
  disabled: boolean,
  setField: (key: string, value: unknown, option?: ReferenceOption) => void,
) {
  return [
    profileFieldSpec(EMPLOYMENT_COMPANY_FIELD, draft, disabled, setField),
    ...PERIOD_DATE_FIELDS.map((field) => profileFieldSpec(field, draft, disabled, setField)),
  ];
}

function assignmentCorrectionItems(
  draft: PeriodRevisionDraft,
  disabled: boolean,
  setField: (key: string, value: unknown, option?: ReferenceOption) => void,
) {
  const fields = [
    ...edpFields.filter((field) => !["startDate", "endDate"].includes(field.key)),
    ...PERIOD_DATE_FIELDS,
  ];
  return fields.map((field) => profileFieldSpec(field, draft, disabled, setField));
}

function revisionReady(draft: PeriodRevisionDraft) {
  if (!draft.startDate || !draft.reason.trim()) return false;
  if (draft.entityType === "Employment") return Boolean(draft.currentCompany);
  return Boolean(
    draft.reportingCompanyId
    && draft.departmentId
    && draft.positionId
    && draft.allocationWeight
    && Number(draft.allocationWeight) > 0,
  );
}

function periodTargets(profile: EmployeeProfile | null): PeriodTarget[] {
  if (!profile) return [];
  return [
    ...profile.employments.flatMap((row) => row.id ? [employmentTarget(row, row.id)] : []),
    ...profile.edps.flatMap((row) => row.id ? [assignmentTarget(row, row.id)] : []),
  ];
}

function employmentTarget(row: EmploymentRow, id: number): PeriodTarget {
  return {
    entityType: "Employment",
    periodId: id,
    expectedVersion: row.version,
    label: `${row.currentCompany || "公司待补"} · ${row.joinDate || "开始日期待补"} 至 ${row.leaveDate || "长期"}`,
    startDate: row.joinDate || "",
    endDate: row.leaveDate,
    currentCompany: row.currentCompany,
    reportingCompanyId: null,
    reportingCompanyName: null,
    departmentId: null,
    departmentName: null,
    departmentPath: null,
    positionId: null,
    positionName: null,
    isPrimary: false,
    allocationWeight: null,
    reportToPositionId: null,
    reportTo: null,
  };
}

function assignmentTarget(row: EdpRow, id: number): PeriodTarget {
  return {
    entityType: "EDP",
    periodId: id,
    expectedVersion: row.version,
    label: `${row.positionName || "岗位待补"} · ${row.departmentName || "部门待补"} · ${row.startDate || "开始日期待补"} 至 ${row.endDate || "长期"}`,
    startDate: row.startDate || "",
    endDate: row.endDate,
    currentCompany: null,
    reportingCompanyId: row.reportingCompanyId,
    reportingCompanyName: row.reportingCompanyName ?? null,
    departmentId: row.departmentId,
    departmentName: row.departmentName,
    departmentPath: row.departmentPath,
    positionId: row.positionId,
    positionName: row.positionName,
    isPrimary: row.isPrimary,
    allocationWeight: row.allocationWeight,
    reportToPositionId: row.reportToPositionId,
    reportTo: row.reportTo,
  };
}

function toDraft(target: PeriodTarget | undefined): PeriodRevisionDraft | null {
  return target ? { ...target, reason: "" } : null;
}

function periodTypes(targets: PeriodTarget[]) {
  return [
    ...(targets.some((target) => target.entityType === "Employment") ? [{ value: "Employment", label: "雇佣记录" }] : []),
    ...(targets.some((target) => target.entityType === "EDP") ? [{ value: "EDP", label: "任职记录" }] : []),
  ];
}

function choiceItem(
  key: string,
  label: string,
  value: string,
  options: Array<{ value: string; label: string }>,
  onChange: (value: string) => void,
  disabled: boolean,
): FormSurfaceItemSpec {
  return {
    key,
    label,
    spec: {
      valueType: "string",
      control: "choice",
      state: disabled ? "disabled" : "normal",
      options: { source: "static", items: options, visibleCount: Math.max(1, options.length) },
    },
    value,
    onChange: (next) => onChange(String(next ?? "")),
  };
}
