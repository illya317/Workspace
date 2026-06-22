import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import { serializeHrMajorItems } from "@workspace/hr/constants/field-options";
import { normalizeHrSchoolValue } from "@workspace/hr/constants/school-options";
import { normalizeEmployeeOption, rejectInvalidDateField } from "../field-validation";

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
  if (field === "employeeId") return failCommand("员工编号由系统生成，不能手动修改");
  const dateResult = rejectInvalidDateField(field, value, DATE_FIELDS);
  if (!dateResult) return failCommand("日期格式无效");
  if (field === "alias") return okCommand({ field, value: normalizeAliasUpdate(value) });
  if (field === "major") return okCommand({ field, value: serializeHrMajorItems(value) });
  if (field === "school") {
    const result = normalizeHrSchoolValue(value);
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
