"use client";

import { useEffect, useMemo, useState } from "react";

import { workspacePath } from "@workspace/core/routing";
import { createFieldsSection, createPanelSection, type BodySurfaceSectionCreateSpec, type BodySurfaceSectionSpec, type FormSurfaceItemSpec, type ReferenceOption, useFeedback } from "@workspace/core/ui";
import { HR_SOCIAL_INSURANCE_TEMPORAL } from "@workspace/hr/business-temporal";
import { SOCIAL_INSURANCE_STOP_REASONS } from "@workspace/hr/constants";
import {
  employeeSocialInsuranceCurrentStatus,
  employeeSocialInsuranceFieldRequired,
  employeeSocialInsuranceRegistrationCompany,
  EMPLOYEE_SOCIAL_INSURANCE_STATUS_LABELS,
  EMPLOYEE_SOCIAL_INSURANCE_STATUSES,
  type EmployeeSocialInsuranceStatus,
} from "@workspace/hr/employee-social-insurance-contract";
import type { EmployeeSocialInsuranceRow } from "@workspace/hr/types";
import { createBusinessTemporalRecordSections } from "@workspace/platform/ui";
import { profileFieldSpec } from "./EmployeeProfileFieldSpecs";
import {
  initialSocialInsuranceSupplementDraft,
  SOCIAL_INSURANCE_COMPANY_FIELD,
  socialInsuranceCurrentStatusPanel,
  socialInsuranceRecordColumns,
  socialInsuranceSupplementableFields,
  socialInsuranceSupplementItems,
  socialInsuranceSupplementPatch,
  type SupplementDraft,
} from "./EmployeeSocialInsuranceRecordPresentation";
type InsuranceCommandKind = "register" | "transfer" | "stop";

type InsuranceDraft = {
  kind: InsuranceCommandKind;
  insuranceStatus: EmployeeSocialInsuranceStatus;
  companyId: number | null;
  companyName: string | null;
  startMonth: string;
  endMonth: string;
  stopReason: string;
  note: string;
};

export function useEmployeeSocialInsuranceSections(input: {
  employeeId: number;
  rows: EmployeeSocialInsuranceRow[];
  asOfDate: string;
  canEdit: boolean;
  onSaved: () => Promise<void>;
}): BodySurfaceSectionSpec[] {
  const feedback = useFeedback();
  const current = useMemo(() => input.rows.find((row) => row.insuranceStatus === "insured") ?? null, [input.rows]);
  const currentStatus = useMemo(() => employeeSocialInsuranceCurrentStatus(input.rows), [input.rows]);
  const suggestedCompany = useMemo(
    () => employeeSocialInsuranceRegistrationCompany(currentStatus
      ? [currentStatus, ...input.rows.filter((row) => row.periodUid !== currentStatus.periodUid)]
      : input.rows),
    [currentStatus, input.rows],
  );
  const recordRows = useMemo(() => currentStatus
    ? [currentStatus, ...input.rows.filter((row) => row.periodUid !== currentStatus.periodUid)]
    : input.rows, [currentStatus, input.rows]);
  const [draft, setDraft] = useState<InsuranceDraft>(() => initialDraft(current, suggestedCompany, input.asOfDate));
  const [registering, setRegistering] = useState(() => input.rows.length === 0);
  const [selectedPeriodUid, setSelectedPeriodUid] = useState<string | null>(null);
  const selected = useMemo(
    () => recordRows.find((row) => row.periodUid === selectedPeriodUid) ?? null,
    [recordRows, selectedPeriodUid],
  );
  const [supplementDraft, setSupplementDraft] = useState<SupplementDraft>(() => initialSocialInsuranceSupplementDraft(selected));
  const [saving, setSaving] = useState(false);
  const [savingSupplement, setSavingSupplement] = useState(false);

  useEffect(() => {
    setDraft(initialDraft(current, suggestedCompany, input.asOfDate));
    setRegistering(input.rows.length === 0);
  }, [current, input.asOfDate, input.rows.length, suggestedCompany]);

  useEffect(() => {
    setSelectedPeriodUid((existing) => (
      existing && input.rows.some((row) => row.periodUid === existing)
        ? existing
        : null
    ));
  }, [input.rows]);

  useEffect(() => {
    setSupplementDraft(initialSocialInsuranceSupplementDraft(selected));
  }, [selected]);

  function setField(key: keyof InsuranceDraft, value: unknown, option?: ReferenceOption) {
    setDraft((existing) => ({
      ...existing,
      [key]: key === "companyId" ? Number(value) || null : String(value ?? ""),
      ...(key === "companyId" ? { companyName: option?.name ?? null } : {}),
      ...(key === "insuranceStatus" ? statusMonthDefaults(
        String(value) as EmployeeSocialInsuranceStatus,
        input.asOfDate,
      ) : {}),
      ...(key === "insuranceStatus" ? statusCompanyDefaults(
        String(value) as EmployeeSocialInsuranceStatus,
        existing,
        suggestedCompany,
      ) : {}),
    }));
  }

  async function submit() {
    const command = draft.kind === "register"
      ? {
          kind: draft.kind,
          insuranceStatus: draft.insuranceStatus,
          companyId: draft.insuranceStatus === "insured" || draft.insuranceStatus === "stopped"
            ? draft.companyId
            : null,
          startMonth: draft.insuranceStatus === "uninsured" ? null : draft.startMonth || null,
          endMonth: draft.insuranceStatus === "stopped" || draft.insuranceStatus === "retired"
            ? draft.endMonth || null
            : null,
          stopReason: draft.insuranceStatus === "stopped" ? draft.stopReason || null : null,
          note: draft.note || null,
        }
      : draft.kind === "transfer" && current
        ? { kind: draft.kind, periodUid: current.periodUid, expectedVersion: current.version, companyId: draft.companyId, startMonth: draft.startMonth, note: draft.note || null }
        : current
          ? { kind: "stop", periodUid: current.periodUid, expectedVersion: current.version, endMonth: draft.endMonth, stopReason: draft.stopReason, note: draft.note || null }
          : null;
    if (!command) return;
    if (draft.kind === "stop") {
      const confirmed = await feedback.confirm({
        title: "确认停止参保",
        message: `${draft.endMonth || "所选月份"} 将作为最后参保月份，是否继续？`,
        confirmLabel: "确认停保",
      });
      if (!confirmed) return;
    }
    setSaving(true);
    try {
      const response = await fetch(workspacePath(`/api/modules/hr/roster/employee-profiles/${input.employeeId}/social-insurance`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error || "社会保险办理失败");
      feedback.success(draft.kind === "register" ? "参保登记已保存" : draft.kind === "transfer" ? "参保转移已保存" : "停保记录已保存");
      setRegistering(false);
      await input.onSaved();
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "社会保险办理失败");
    } finally {
      setSaving(false);
    }
  }

  function setSupplementField(key: keyof SupplementDraft, value: unknown, option?: ReferenceOption) {
    setSupplementDraft((existing) => ({
      ...existing,
      [key]: key === "companyId" ? Number(value) || null : String(value ?? ""),
      ...(key === "companyId" ? { companyName: option?.name ?? null } : {}),
    }));
  }

  async function submitSupplement() {
    if (!selected) return;
    const patch = socialInsuranceSupplementPatch(selected, supplementDraft);
    if (Object.keys(patch).length === 0 || !supplementDraft.reason.trim()) return;
    setSavingSupplement(true);
    try {
      const response = await fetch(workspacePath(`/api/modules/hr/roster/employee-profiles/${input.employeeId}/social-insurance`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "supplement-missing",
          periodUid: selected.periodUid,
          expectedVersion: selected.version,
          patch,
          reason: supplementDraft.reason,
        }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error || "补充资料保存失败");
      feedback.success("缺失资料已补充");
      await input.onSaved();
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "补充资料保存失败");
    } finally {
      setSavingSupplement(false);
    }
  }

  const registrationCreate = input.canEdit && !current ? {
    id: "social-insurance-register",
    title: "参保登记",
    trigger: "surface",
    presentation: "block",
    open: registering,
    canCreate: true,
    disabled: saving,
    content: {
      kind: "form",
      form: {
        items: commandItems({ draft, current: null, saving, setField }),
        layout: { columns: 2 },
      },
    },
    submission: {
      action: "save",
      disabled: saving || commandMissingRequiredField(draft),
      execute: submit,
    },
    onOpenChange: (open: boolean) => {
      if (open) setDraft(initialDraft(null, suggestedCompany, input.asOfDate));
      setRegistering(open);
    },
    onCancel: () => setRegistering(false),
  } satisfies BodySurfaceSectionCreateSpec : undefined;
  const sections: BodySurfaceSectionSpec[] = [];
  if (input.canEdit && current) {
    sections.push(createFieldsSection("social-insurance-command", commandItems({
      draft,
      current,
      saving,
      setField,
    }), {
      header: { title: "社会保险办理" },
      layout: { columns: 2 },
      actions: [
        {
          key: "save-social-insurance",
          action: "save" as const,
          label: saving ? "保存中..." : draft.kind === "register" ? "确认参保" : draft.kind === "transfer" ? "确认转移" : "确认停保",
          disabled: saving || commandMissingRequiredField(draft),
          onClick: () => void submit(),
        },
      ],
    }));
  }
  if (currentStatus) {
    sections.push(socialInsuranceCurrentStatusPanel(
      "social-insurance-current",
      currentStatus.insuranceStatus === "insured" ? "当前参保" : "当前社保状态",
      currentStatus,
      registrationCreate,
    ));
  } else if (registrationCreate) {
    sections.push(createPanelSection("social-insurance-current", {
      title: "当前社保状态",
      create: registrationCreate,
      sections: [],
    }));
  }
  if (input.rows.length > 0) {
    const hasSupplementFields = selected ? socialInsuranceSupplementableFields(selected).length > 0 : false;
    const supplementActions = selected && input.canEdit && hasSupplementFields ? [{
      key: "save-social-insurance-supplement",
      action: "save" as const,
      label: savingSupplement ? "保存中..." : "保存补充资料",
      disabled: savingSupplement
        || !supplementDraft.reason.trim()
        || Object.keys(socialInsuranceSupplementPatch(selected, supplementDraft)).length === 0,
      onClick: () => void submitSupplement(),
    }] : [];
    sections.push(...createBusinessTemporalRecordSections({
      registration: HR_SOCIAL_INSURANCE_TEMPORAL,
      key: "social-insurance",
      title: `社保记录（${recordRows.length}）`,
      rows: recordRows,
      columns: socialInsuranceRecordColumns(currentStatus?.periodUid ?? null),
      visibleColumns: ["company", "status", "startMonth", "endMonth", "stopReason"],
      rowKey: (row) => row.periodUid,
      selectedKey: selectedPeriodUid,
      onSelect: (row) => setSelectedPeriodUid((existing) => existing === row.periodUid ? null : row.periodUid),
      emptyText: "暂无社保记录",
      detail: selected ? {
        items: socialInsuranceSupplementItems({
          row: selected,
          draft: supplementDraft,
          editable: input.canEdit && hasSupplementFields,
          saving: savingSupplement,
          setField: setSupplementField,
        }),
        mutation: supplementActions.length > 0 ? {
          kind: "supplement-missing",
          targetFields: socialInsuranceSupplementableFields(selected),
          missingFields: selected.missingFields,
          actions: supplementActions,
        } : undefined,
      } : undefined,
    }));
  }
  return sections;
}

function commandItems(input: {
  draft: InsuranceDraft;
  current: EmployeeSocialInsuranceRow | null;
  saving: boolean;
  setField: (key: keyof InsuranceDraft, value: unknown, option?: ReferenceOption) => void;
}): FormSurfaceItemSpec[] {
  const { draft, current, saving, setField } = input;
  const items: FormSurfaceItemSpec[] = [];
  if (!current) {
    items.push({
      key: "insuranceStatus",
      label: "社保状态",
      required: true,
      value: draft.insuranceStatus,
      spec: {
        valueType: "string",
        control: "choice",
        state: saving ? "disabled" : "required",
        options: {
          source: "static",
          items: EMPLOYEE_SOCIAL_INSURANCE_STATUSES.map((status) => ({
            value: status,
            label: EMPLOYEE_SOCIAL_INSURANCE_STATUS_LABELS[status],
          })),
        },
      },
      onChange: (value) => setField("insuranceStatus", value),
    });
  }
  if (current) {
    items.push({
      key: "kind",
      label: "办理类型",
      required: true,
      value: draft.kind,
      spec: {
        valueType: "string",
        control: "choice",
        state: saving ? "disabled" : "required",
        options: { source: "static", items: [{ value: "transfer", label: "参保转移" }, { value: "stop", label: "停止参保" }] },
      },
      onChange: (value) => setField("kind", value),
    });
  }
  const companyVisible = draft.kind === "transfer"
    || (draft.kind === "register" && (draft.insuranceStatus === "insured" || draft.insuranceStatus === "stopped"));
  if (companyVisible) {
    const companyRequired = draft.kind === "transfer" || employeeSocialInsuranceFieldRequired({
      operation: "register",
      status: draft.insuranceStatus,
      field: "companyId",
    });
    items.push(profileFieldSpec(
      { ...SOCIAL_INSURANCE_COMPANY_FIELD, required: companyRequired },
      draft,
      saving,
      (key, value, option) => setField(key as keyof InsuranceDraft, value, option),
    ));
  } else if (current) {
    items.push({ kind: "readonly", key: "company", label: "参保公司", value: current.companyName || "未设置" });
  }
  if (
    draft.kind === "transfer"
    || (
      draft.kind === "register"
      && draft.insuranceStatus !== "uninsured"
    )
  ) {
    const startRequired = draft.kind === "transfer" || employeeSocialInsuranceFieldRequired({
      operation: "register",
      status: draft.insuranceStatus,
      field: "startMonth",
    });
    items.push(monthItem(
      "startMonth",
      "参保月份",
      draft.startMonth,
      startRequired,
      saving,
      setField,
    ));
  }
  if (
    draft.kind === "stop"
    || (
      draft.kind === "register"
      && (draft.insuranceStatus === "stopped" || draft.insuranceStatus === "retired")
    )
  ) {
    const endRequired = draft.kind === "stop" || employeeSocialInsuranceFieldRequired({
      operation: "register",
      status: draft.insuranceStatus,
      field: "endMonth",
    });
    items.push(monthItem(
      "endMonth",
      "停保月份",
      draft.endMonth,
      endRequired,
      saving,
      setField,
    ));
  }
  if (draft.kind === "stop" || (draft.kind === "register" && draft.insuranceStatus === "stopped")) {
    items.push({
      key: "stopReason",
      label: "停保原因",
      required: true,
      value: draft.stopReason,
      spec: {
        valueType: "string",
        control: "choice",
        state: saving ? "disabled" : "required",
        options: { source: "static", items: SOCIAL_INSURANCE_STOP_REASONS.map((reason) => ({ value: reason, label: reason })) },
      },
      onChange: (value) => setField("stopReason", value),
    });
  }
  items.push({
    key: "note",
    label: "备注",
    span: "wide",
    value: draft.note,
    spec: { valueType: "string", control: "text", multiline: true, state: saving ? "disabled" : "normal" },
    rows: 2,
    onChange: (value) => setField("note", value),
  });
  return items;
}

function initialDraft(
  current: EmployeeSocialInsuranceRow | null,
  suggestedCompany: { companyId: number | null; companyName: string | null } | null,
  asOfDate: string,
): InsuranceDraft {
  return {
    kind: current ? "transfer" : "register",
    insuranceStatus: current?.insuranceStatus ?? "insured",
    companyId: current ? null : suggestedCompany?.companyId ?? null,
    companyName: current ? null : suggestedCompany?.companyName ?? null,
    startMonth: asOfDate.slice(0, 7),
    endMonth: asOfDate.slice(0, 7),
    stopReason: "",
    note: "",
  };
}

function commandMissingRequiredField(draft: InsuranceDraft) {
  const operation = draft.kind;
  const status = operation === "stop" ? "stopped" : operation === "transfer" ? "insured" : draft.insuranceStatus;
  const values = {
    insuranceStatus: draft.insuranceStatus,
    companyId: draft.companyId,
    startMonth: draft.startMonth,
    endMonth: draft.endMonth,
    stopReason: draft.stopReason,
  };
  return (Object.keys(values) as Array<keyof typeof values>).some((field) => (
    employeeSocialInsuranceFieldRequired({ operation, status, field })
    && !values[field]
  ));
}

function statusMonthDefaults(status: EmployeeSocialInsuranceStatus, asOfDate: string) {
  const currentMonth = asOfDate.slice(0, 7);
  if (status === "insured") return { startMonth: currentMonth, endMonth: "" };
  if (status === "stopped") return { startMonth: "", endMonth: currentMonth };
  return { startMonth: "", endMonth: "" };
}

function statusCompanyDefaults(
  status: EmployeeSocialInsuranceStatus,
  current: InsuranceDraft,
  suggested: { companyId: number | null; companyName: string | null } | null,
) {
  if (status === "insured" || status === "stopped") {
    return {
      companyId: current.companyId ?? suggested?.companyId ?? null,
      companyName: current.companyName ?? suggested?.companyName ?? null,
    };
  }
  return { companyId: null, companyName: null };
}

function monthItem(
  key: "startMonth" | "endMonth",
  label: string,
  value: string,
  required: boolean,
  saving: boolean,
  setField: (key: keyof InsuranceDraft, value: unknown, option?: ReferenceOption) => void,
): FormSurfaceItemSpec {
  return {
    key,
    label,
    required,
    value,
    spec: {
      valueType: "date",
      control: "temporal",
      precision: "month",
      state: saving ? "disabled" : required ? "required" : "normal",
      validation: { pattern: "^\\d{4}-(0[1-9]|1[0-2])$" },
    },
    onChange: (next) => setField(key, next),
  };
}
