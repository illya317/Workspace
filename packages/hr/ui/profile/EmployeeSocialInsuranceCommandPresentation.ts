import type { FormSurfaceItemSpec, ReferenceOption } from "@workspace/core/ui";
import { SOCIAL_INSURANCE_STOP_REASONS } from "@workspace/hr/constants";
import {
  employeeSocialInsuranceFieldRequired,
  EMPLOYEE_SOCIAL_INSURANCE_STATUS_LABELS,
  EMPLOYEE_SOCIAL_INSURANCE_STATUSES,
  type EmployeeSocialInsuranceStatus,
} from "@workspace/hr/employee-social-insurance-contract";
import type { EmployeeSocialInsuranceRow } from "@workspace/hr/types";
import { profileFieldSpec } from "./EmployeeProfileFieldSpecs";
import { SOCIAL_INSURANCE_COMPANY_FIELD } from "./EmployeeSocialInsuranceRecordPresentation";

type InsuranceCommandKind = "register" | "transfer" | "stop";

export type InsuranceDraft = {
  kind: InsuranceCommandKind;
  insuranceStatus: EmployeeSocialInsuranceStatus;
  companyId: number | null;
  companyName: string | null;
  startMonth: string;
  endMonth: string;
  stopReason: string;
  note: string;
};

export function socialInsuranceCommandItems(input: {
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
  if (draft.kind === "transfer" || (draft.kind === "register" && draft.insuranceStatus !== "uninsured")) {
    const required = draft.kind === "transfer" || employeeSocialInsuranceFieldRequired({
      operation: "register", status: draft.insuranceStatus, field: "startMonth",
    });
    items.push(monthItem("startMonth", "参保月份", draft.startMonth, required, saving, setField));
  }
  if (draft.kind === "stop" || (draft.kind === "register" && (draft.insuranceStatus === "stopped" || draft.insuranceStatus === "retired"))) {
    const required = draft.kind === "stop" || employeeSocialInsuranceFieldRequired({
      operation: "register", status: draft.insuranceStatus, field: "endMonth",
    });
    items.push(monthItem("endMonth", "停保月份", draft.endMonth, required, saving, setField));
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

export function initialSocialInsuranceCommandDraft(
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

export function socialInsuranceCommandMissingRequiredField(draft: InsuranceDraft) {
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
    employeeSocialInsuranceFieldRequired({ operation, status, field }) && !values[field]
  ));
}

export function socialInsuranceStatusMonthDefaults(status: EmployeeSocialInsuranceStatus, asOfDate: string) {
  const currentMonth = asOfDate.slice(0, 7);
  if (status === "insured") return { startMonth: currentMonth, endMonth: "" };
  if (status === "stopped") return { startMonth: "", endMonth: currentMonth };
  return { startMonth: "", endMonth: "" };
}

export function socialInsuranceStatusCompanyDefaults(
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

export function socialInsuranceCorrectionStatusDefaults(status: EmployeeSocialInsuranceStatus) {
  if (status === "insured") return { endMonth: "", stopReason: "" };
  if (status === "uninsured") {
    return { companyId: null, companyName: null, startMonth: "", endMonth: "", stopReason: "" };
  }
  if (status === "retired") return { companyId: null, companyName: null, stopReason: "" };
  return {};
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
