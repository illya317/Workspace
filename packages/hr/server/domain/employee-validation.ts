import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import { serializeHrMajorItems } from "@workspace/hr/constants/field-options";
import { normalizeHrSchoolValue } from "@workspace/hr/constants/school-options";
import { getTenantConfig } from "@workspace/platform/server/tenant-config";
import { normalizeEmployeeOption, rejectInvalidDateField } from "../field-validation";
import {
  buildHrPageDraftEnvelopeCommand,
  type HrPageDraftInput,
} from "./page-draft-validation";

export const EMPLOYEE_ALLOWED_FIELDS = [
  "employeeId",
  "name",
  "alias",
  "gender",
  "birthDate",
  "ethnicity",
  "hometown",
  "politics",
  "education",
  "title",
  "school",
  "major",
  "phone",
  "workStartDate",
  "idNumber",
  "otherId",
  "userId",
];

const DATE_FIELDS = ["birthDate", "workStartDate"];

export interface EmployeeCreateCommand {
  name: string;
}

export interface EmployeeFieldUpdateCommand {
  field: string;
  value: unknown;
}

function normalizeAliasUpdate(value: unknown) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  let rawTags: unknown[] = [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) rawTags = parsed;
  } catch {
    rawTags = text.split(/[,，、;；\n]+/);
  }
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of rawTags) {
    const tag = String(item).trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags.length > 0 ? JSON.stringify(tags) : null;
}

export function buildEmployeeCreateCommand(name: string): DomainValidationResult<EmployeeCreateCommand> {
  const cleanName = name.trim();
  return cleanName ? okCommand({ name: cleanName }) : failCommand("姓名必填");
}

export function buildEmployeeFieldUpdateCommand(
  field: string,
  value: unknown,
): DomainValidationResult<EmployeeFieldUpdateCommand> {
  if (field === "employeeId") {
    const employeeId = String(value ?? "").trim();
    return /^[A-Za-z0-9._-]{1,64}$/.test(employeeId)
      ? okCommand({ field, value: employeeId })
      : failCommand("员工编号仅支持 1 至 64 位字母、数字、点、下划线或短横线", 400, field);
  }
  if (field === "userId") {
    if (value == null || value === "") return okCommand({ field, value: null });
    const userId = Number(value);
    return Number.isInteger(userId) && userId > 0
      ? okCommand({ field, value: userId })
      : failCommand("关联账号无效", 400, field);
  }
  const dateResult = rejectInvalidDateField(field, value, DATE_FIELDS);
  if (!dateResult) return failCommand("日期格式无效");
  if (field === "alias") return okCommand({ field, value: normalizeAliasUpdate(value) });
  if (field === "major") return okCommand({ field, value: serializeHrMajorItems(value) });
  if (field === "school") {
    const result = normalizeHrSchoolValue(value, getTenantConfig().hrCatalogs);
    return result.ok ? okCommand({ field, value: result.value }) : failCommand(result.error);
  }
  if (field === "gender") {
    if (value === "男" || value === true) return okCommand({ field, value: true });
    if (value === "女" || value === false) return okCommand({ field, value: false });
    return okCommand({ field, value: null });
  }
  if (["ethnicity", "politics", "education", "title", "phone", "idNumber"].includes(field)) {
    const result = normalizeEmployeeOption(field, value);
    if (!result) return failCommand("字段值不在允许范围内");
    if ("error" in result) return failCommand(result.error || "字段值不在允许范围内");
    return okCommand({ field: result.field, value: result.value });
  }
  return okCommand({ field, value });
}

export function buildEmployeePageDraftCommand(input: HrPageDraftInput) {
  const envelope = buildHrPageDraftEnvelopeCommand(input);
  if (!envelope.ok) return envelope;
  const changes = [];
  for (const change of envelope.data.changes) {
    if (!EMPLOYEE_ALLOWED_FIELDS.includes(change.field)) return failCommand("字段不允许修改", 400, change.field);
    const field = buildEmployeeFieldUpdateCommand(change.field, change.value);
    if (!field.ok) return field;
    changes.push({ id: change.id, field: field.data.field, value: field.data.value });
  }
  return okCommand({ userId: envelope.data.userId, changes });
}
