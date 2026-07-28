import {
  createFieldsSection,
  createPanelSection,
  type BodySurfaceSectionCreateSpec,
  type DataSurfaceColumnSpec,
  type FormSurfaceItemSpec,
  type ReferenceOption,
} from "@workspace/core/ui";
import { SOCIAL_INSURANCE_STOP_REASONS } from "@workspace/hr/constants";
import {
  EMPLOYEE_SOCIAL_INSURANCE_STATUS_LABELS,
  type EmployeeSocialInsuranceStatus,
} from "@workspace/hr/employee-social-insurance-contract";
import type { EmployeeSocialInsuranceRow, ProfileField } from "@workspace/hr/types";
import { profileFieldSpec } from "./EmployeeProfileFieldSpecs";

export type SupplementDraft = {
  insuranceStatus: EmployeeSocialInsuranceStatus;
  companyId: number | null;
  companyName: string | null;
  startMonth: string;
  endMonth: string;
  stopReason: string;
  note: string;
  reason: string;
};

export const SOCIAL_INSURANCE_COMPANY_FIELD: ProfileField = {
  key: "companyId",
  label: "参保公司",
  type: "fk",
  entity: "company",
  fkKey: "hr.company",
  displayKey: "companyName",
  required: false,
};

export function socialInsuranceSupplementItems(input: {
  row: EmployeeSocialInsuranceRow;
  draft: SupplementDraft;
  editable: boolean;
  saving: boolean;
  setField: (key: keyof SupplementDraft, value: unknown, option?: ReferenceOption) => void;
}): FormSurfaceItemSpec[] {
  const { row, draft, editable, saving, setField } = input;
  const missing = new Set(socialInsuranceSupplementableFields(row));
  const items: FormSurfaceItemSpec[] = [];
  if (editable && missing.has("companyId")) {
    items.push(profileFieldSpec(SOCIAL_INSURANCE_COMPANY_FIELD, draft, saving, (key, value, option) => (
      setField(key as keyof SupplementDraft, value, option)
    )));
  } else {
    items.push({ kind: "readonly", key: "company", label: "参保公司", value: row.companyName || (missing.has("companyId") ? "待补充" : "—") });
  }
  items.push({ kind: "readonly", key: "status", label: "社保状态", value: EMPLOYEE_SOCIAL_INSURANCE_STATUS_LABELS[row.insuranceStatus] });
  if (editable && missing.has("startMonth")) {
    items.push(supplementMonthItem("startMonth", "参保月份", draft.startMonth, saving, setField));
  } else {
    items.push({ kind: "readonly", key: "startMonth", label: "参保月份", value: row.startMonth || (missing.has("startMonth") ? "待补充" : "—") });
  }
  if (editable && missing.has("endMonth")) {
    items.push(supplementMonthItem("endMonth", "停保月份", draft.endMonth, saving, setField));
  } else {
    items.push({
      kind: "readonly",
      key: "endMonth",
      label: "停保月份",
      value: row.endMonth || (row.insuranceStatus === "insured" ? "在保" : missing.has("endMonth") ? "待补充" : "—"),
    });
  }
  if (row.insuranceStatus === "stopped" || missing.has("stopReason")) {
    if (editable && missing.has("stopReason")) {
      items.push({
        key: "stopReason",
        label: "停保原因",
        value: draft.stopReason,
        spec: {
          valueType: "string",
          control: "choice",
          state: saving ? "disabled" : "normal",
          options: { source: "static", items: SOCIAL_INSURANCE_STOP_REASONS.map((reason) => ({ value: reason, label: reason })) },
        },
        onChange: (value) => setField("stopReason", value),
      });
    } else {
      items.push({ kind: "readonly", key: "stopReason", label: "停保原因", value: row.stopReason || (missing.has("stopReason") ? "待补充" : "—") });
    }
  }
  if (editable) {
    items.push({
      key: "reason",
      label: "补充说明",
      required: true,
      span: "wide",
      value: draft.reason,
      spec: { valueType: "string", control: "text", multiline: true, state: saving ? "disabled" : "required" },
      rows: 2,
      onChange: (value) => setField("reason", value),
    });
  }
  return items;
}

export function socialInsuranceCorrectionItems(input: {
  row: EmployeeSocialInsuranceRow;
  draft: SupplementDraft;
  saving: boolean;
  setField: (key: keyof SupplementDraft, value: unknown, option?: ReferenceOption) => void;
}): FormSurfaceItemSpec[] {
  const { row, draft, saving, setField } = input;
  const missing = new Set(socialInsuranceSupplementableFields(row));
  const items: FormSurfaceItemSpec[] = [{
    key: "insuranceStatus",
    label: "社保状态",
    value: draft.insuranceStatus,
    spec: {
      valueType: "string",
      control: "choice",
      state: saving ? "disabled" : "normal",
      options: {
        source: "static",
        items: Object.entries(EMPLOYEE_SOCIAL_INSURANCE_STATUS_LABELS).map(([value, label]) => ({ value, label })),
      },
    },
    onChange: (value) => setField("insuranceStatus", value),
  }];
  if (missing.has("companyId")) {
    items.push({ kind: "readonly", key: "company", label: "参保公司", value: "待补充" });
  } else {
    items.push(profileFieldSpec(SOCIAL_INSURANCE_COMPANY_FIELD, draft, saving, (key, value, option) => (
      setField(key as keyof SupplementDraft, value, option)
    )));
  }
  for (const [key, label] of [["startMonth", "参保月份"], ["endMonth", "停保月份"]] as const) {
    items.push(missing.has(key)
      ? { kind: "readonly", key, label, value: "待补充" }
      : supplementMonthItem(key, label, draft[key], saving, setField));
  }
  items.push(missing.has("stopReason")
    ? { kind: "readonly", key: "stopReason", label: "停保原因", value: "待补充" }
    : {
        key: "stopReason",
        label: "停保原因",
        value: draft.stopReason,
        spec: {
          valueType: "string",
          control: "choice",
          state: saving ? "disabled" : "normal",
          options: { source: "static", items: SOCIAL_INSURANCE_STOP_REASONS.map((reason) => ({ value: reason, label: reason })) },
        },
        onChange: (value) => setField("stopReason", value),
      });
  items.push({
    key: "note",
    label: "备注",
    span: "wide",
    value: draft.note,
    spec: { valueType: "string", control: "text", multiline: true, state: saving ? "disabled" : "normal" },
    rows: 2,
    onChange: (value) => setField("note", value),
  }, {
    key: "reason",
    label: "修正说明",
    required: true,
    span: "wide",
    value: draft.reason,
    spec: { valueType: "string", control: "text", multiline: true, state: saving ? "disabled" : "required" },
    rows: 2,
    onChange: (value) => setField("reason", value),
  });
  return items;
}

export function socialInsuranceCurrentStatusPanel(
  key: string,
  title: string,
  row: EmployeeSocialInsuranceRow,
  create?: BodySurfaceSectionCreateSpec,
) {
  const fields: FormSurfaceItemSpec[] = [
    { kind: "readonly", key: "company", label: "参保公司", value: row.companyName || "未设置" },
    { kind: "readonly", key: "status", label: "社保状态", value: EMPLOYEE_SOCIAL_INSURANCE_STATUS_LABELS[row.insuranceStatus] },
    ...(row.startMonth ? [{ kind: "readonly" as const, key: "startMonth", label: "参保月份", value: row.startMonth }] : []),
    ...(row.endMonth ? [{ kind: "readonly" as const, key: "endMonth", label: "停保月份", value: row.endMonth }] : []),
    ...(row.insuranceStatus === "stopped" && row.stopReason ? [{ kind: "readonly" as const, key: "stopReason", label: "停保原因", value: row.stopReason }] : []),
    ...(row.note ? [{ kind: "readonly" as const, key: "note", label: "备注", value: row.note, span: "wide" as const }] : []),
  ];
  return createPanelSection(key, {
    title,
    create,
    sections: [createFieldsSection(`${key}-fields`, fields, { layout: { columns: 2 } })],
  });
}

export function socialInsuranceRecordColumns(currentPeriodUid: string | null): Array<DataSurfaceColumnSpec<EmployeeSocialInsuranceRow>> {
  return [
    { key: "company", label: "参保公司", required: true, cell: (row) => row.companyName || "未设置" },
    {
      key: "status",
      label: "社保状态",
      required: true,
      cell: (row) => ({
        kind: "badge",
        label: `${EMPLOYEE_SOCIAL_INSURANCE_STATUS_LABELS[row.insuranceStatus]}${row.periodUid === currentPeriodUid ? " · 当前" : ""}`,
        tone: socialInsuranceStatusTone(row.insuranceStatus),
      }),
    },
    { key: "startMonth", label: "参保月份", cell: (row) => row.startMonth || (row.missingFields.includes("startMonth") ? "待补充" : "—") },
    { key: "endMonth", label: "停保月份", cell: (row) => row.endMonth || (row.insuranceStatus === "insured" ? "在保" : row.missingFields.includes("endMonth") ? "待补充" : "—") },
    { key: "stopReason", label: "停保原因", cell: (row) => row.insuranceStatus === "stopped" ? row.stopReason || (row.missingFields.includes("stopReason") ? "待补充" : "—") : "—" },
  ];
}

export function initialSocialInsuranceSupplementDraft(row: EmployeeSocialInsuranceRow | null): SupplementDraft {
  return {
    insuranceStatus: row?.insuranceStatus ?? "insured",
    companyId: row?.companyId ?? null,
    companyName: row?.companyName ?? null,
    startMonth: row?.startMonth ?? "",
    endMonth: row?.endMonth ?? "",
    stopReason: row?.stopReason ?? "",
    note: row?.note ?? "",
    reason: "",
  };
}

export function socialInsuranceCorrectionPatch(row: EmployeeSocialInsuranceRow, draft: SupplementDraft) {
  const missing = new Set(socialInsuranceSupplementableFields(row));
  return {
    ...(draft.insuranceStatus !== row.insuranceStatus ? { insuranceStatus: draft.insuranceStatus } : {}),
    ...(!missing.has("companyId") && draft.companyId !== row.companyId ? { companyId: draft.companyId } : {}),
    ...(!missing.has("startMonth") && (draft.startMonth || null) !== row.startMonth ? { startMonth: draft.startMonth || null } : {}),
    ...(!missing.has("endMonth") && (draft.endMonth || null) !== row.endMonth ? { endMonth: draft.endMonth || null } : {}),
    ...(!missing.has("stopReason") && (draft.stopReason || null) !== row.stopReason ? { stopReason: draft.stopReason || null } : {}),
    ...((draft.note || null) !== row.note ? { note: draft.note || null } : {}),
  };
}

export function socialInsuranceSupplementableFields(row: EmployeeSocialInsuranceRow | null) {
  if (!row) return [];
  const allowed = new Set(["companyId", "startMonth", "endMonth", "stopReason"]);
  return row.missingFields.filter((field) => allowed.has(field));
}

export function socialInsuranceSupplementPatch(row: EmployeeSocialInsuranceRow, draft: SupplementDraft) {
  const missing = new Set(socialInsuranceSupplementableFields(row));
  return {
    ...(missing.has("companyId") && draft.companyId ? { companyId: draft.companyId } : {}),
    ...(missing.has("startMonth") && draft.startMonth ? { startMonth: draft.startMonth } : {}),
    ...(missing.has("endMonth") && draft.endMonth ? { endMonth: draft.endMonth } : {}),
    ...(missing.has("stopReason") && draft.stopReason ? { stopReason: draft.stopReason } : {}),
  };
}

function socialInsuranceStatusTone(status: EmployeeSocialInsuranceStatus): "green" | "blue" | "amber" | "gray" {
  if (status === "insured") return "green";
  if (status === "retired") return "blue";
  if (status === "stopped") return "amber";
  return "gray";
}

function supplementMonthItem(
  key: "startMonth" | "endMonth",
  label: string,
  value: string,
  saving: boolean,
  setField: (key: keyof SupplementDraft, value: unknown, option?: ReferenceOption) => void,
): FormSurfaceItemSpec {
  return {
    key,
    label,
    value,
    spec: { valueType: "date", control: "temporal", precision: "month", state: saving ? "disabled" : "normal", validation: { pattern: "^\\d{4}-(0[1-9]|1[0-2])$" } },
    onChange: (next) => setField(key, next),
  };
}
