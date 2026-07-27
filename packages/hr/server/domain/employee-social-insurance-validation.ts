import { SOCIAL_INSURANCE_STOP_REASONS } from "@workspace/hr/constants";
import {
  employeeSocialInsuranceFieldRequired,
  EMPLOYEE_SOCIAL_INSURANCE_SUPPLEMENT_FIELDS,
  EMPLOYEE_SOCIAL_INSURANCE_STATUSES,
  type EmployeeSocialInsuranceStatus,
} from "@workspace/hr/employee-social-insurance-contract";
import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import type { EmployeeSocialInsuranceCommandInput } from "../social-insurance-schemas";

export type EmployeeSocialInsuranceCommand = EmployeeSocialInsuranceCommandInput;

function validMonth(value: string) {
  const date = new Date(`${value}-01T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 7) === value;
}

export function buildEmployeeSocialInsuranceCommand(
  input: unknown,
): DomainValidationResult<EmployeeSocialInsuranceCommand> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return failCommand("社会保险命令无效");
  const raw = input as Record<string, unknown>;
  if (raw.kind !== "register" && raw.kind !== "transfer" && raw.kind !== "stop" && raw.kind !== "supplement-missing") {
    return failCommand("社会保险命令类型无效", 400, "kind");
  }
  const kind = raw.kind;
  const note = typeof raw.note === "string" ? raw.note.trim() || null : null;
  if (kind === "register") {
    const insuranceStatus = EMPLOYEE_SOCIAL_INSURANCE_STATUSES.find((status) => status === raw.insuranceStatus) ?? null;
    if (!insuranceStatus) return failCommand("请选择社保状态", 400, "insuranceStatus");
    const companyId = positiveInteger(raw.companyId);
    if (raw.companyId != null && raw.companyId !== "" && !companyId) {
      return failCommand("参保公司无效", 400, "companyId");
    }
    if (raw.startMonth != null && raw.startMonth !== "" && (typeof raw.startMonth !== "string" || !validMonth(raw.startMonth))) {
      return failCommand("参保月份无效", 400, "startMonth");
    }
    if (raw.endMonth != null && raw.endMonth !== "" && (typeof raw.endMonth !== "string" || !validMonth(raw.endMonth))) {
      return failCommand("停保月份无效", 400, "endMonth");
    }
    const startMonth = optionalMonth(raw.startMonth);
    const endMonth = optionalMonth(raw.endMonth);
    const stopReason = SOCIAL_INSURANCE_STOP_REASONS.find((reason) => reason === raw.stopReason) ?? null;
    if (raw.stopReason != null && raw.stopReason !== "" && !stopReason) {
      return failCommand("停保原因无效", 400, "stopReason");
    }
    const requiredError = validateRegisterRequiredFields({ insuranceStatus, companyId, startMonth, endMonth, stopReason });
    if (requiredError) return requiredError;
    return okCommand({ kind, insuranceStatus, companyId, startMonth, endMonth, stopReason, note });
  }
  const periodUid = typeof raw.periodUid === "string" ? raw.periodUid.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(periodUid)) return failCommand("参保记录标识无效", 400, "periodUid");
  const expectedVersion = positiveInteger(raw.expectedVersion);
  if (!expectedVersion) return failCommand("参保记录版本无效", 400, "expectedVersion");
  if (kind === "supplement-missing") {
    const patch = supplementPatch(raw.patch);
    if (!patch.ok) return patch;
    const reason = typeof raw.reason === "string" ? raw.reason.trim() : "";
    if (!reason) return failCommand("请填写补充说明", 400, "reason");
    return okCommand({ kind, periodUid, expectedVersion, patch: patch.data, reason });
  }
  if (kind === "transfer") {
    const companyId = positiveInteger(raw.companyId);
    if (!companyId) return failCommand("参保公司无效", 400, "companyId");
    const startMonth = typeof raw.startMonth === "string" ? raw.startMonth : "";
    if (!validMonth(startMonth)) return failCommand("参保月份无效", 400, "startMonth");
    return okCommand({ kind, periodUid, expectedVersion, companyId, startMonth, note });
  }
  const endMonth = typeof raw.endMonth === "string" ? raw.endMonth : "";
  if (!validMonth(endMonth)) {
    return failCommand("停保月份无效", 400, "endMonth");
  }
  const stopReason = SOCIAL_INSURANCE_STOP_REASONS.find((reason) => reason === raw.stopReason) ?? null;
  if (!stopReason) return failCommand("请选择停保原因", 400, "stopReason");
  return okCommand({ kind, periodUid, expectedVersion, endMonth, stopReason, note });
}

function supplementPatch(value: unknown): DomainValidationResult<Partial<{
  companyId: number;
  startMonth: string;
  endMonth: string;
  stopReason: typeof SOCIAL_INSURANCE_STOP_REASONS[number];
}>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return failCommand("补充资料无效", 400, "patch");
  }
  const raw = value as Record<string, unknown>;
  const keys = Object.keys(raw);
  const allowedFields = new Set<string>(EMPLOYEE_SOCIAL_INSURANCE_SUPPLEMENT_FIELDS);
  if (keys.length === 0 || keys.some((key) => !allowedFields.has(key))) {
    return failCommand("请填写至少一项缺失资料", 400, "patch");
  }
  const patch: Partial<{ companyId: number; startMonth: string; endMonth: string; stopReason: typeof SOCIAL_INSURANCE_STOP_REASONS[number] }> = {};
  if (Object.hasOwn(raw, "companyId")) {
    const companyId = positiveInteger(raw.companyId);
    if (!companyId) return failCommand("参保公司无效", 400, "companyId");
    patch.companyId = companyId;
  }
  for (const field of ["startMonth", "endMonth"] as const) {
    if (!Object.hasOwn(raw, field)) continue;
    if (typeof raw[field] !== "string" || !validMonth(raw[field])) {
      return failCommand(field === "startMonth" ? "参保月份无效" : "停保月份无效", 400, field);
    }
    patch[field] = raw[field];
  }
  if (Object.hasOwn(raw, "stopReason")) {
    const stopReason = SOCIAL_INSURANCE_STOP_REASONS.find((reason) => reason === raw.stopReason);
    if (!stopReason) return failCommand("停保原因无效", 400, "stopReason");
    patch.stopReason = stopReason;
  }
  return okCommand(patch);
}

function validateRegisterRequiredFields(input: {
  insuranceStatus: EmployeeSocialInsuranceStatus;
  companyId: number | null;
  startMonth: string | null;
  endMonth: string | null;
  stopReason: typeof SOCIAL_INSURANCE_STOP_REASONS[number] | null;
}) {
  const fields = [
    ["companyId", input.companyId, "参保公司无效"],
    ["startMonth", input.startMonth, "参保月份无效"],
    ["endMonth", input.endMonth, "停保月份无效"],
    ["stopReason", input.stopReason, "请选择停保原因"],
  ] as const;
  const missing = fields.find(([field, value]) => (
    employeeSocialInsuranceFieldRequired({
      operation: "register",
      status: input.insuranceStatus,
      field,
    }) && !value
  ));
  return missing ? failCommand(missing[2], 400, missing[0]) : null;
}

function optionalMonth(value: unknown) {
  if (value == null || value === "") return null;
  return typeof value === "string" && validMonth(value) ? value : null;
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}
