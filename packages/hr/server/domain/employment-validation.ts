import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import { prisma } from "@workspace/platform/server/prisma";
import { isValidDateValue, rejectInvalidDateField, validateEmploymentOption } from "../field-validation";

const DATE_FIELDS = ["joinDate", "leaveDate"];
const OPTION_FIELDS = ["officeLocation", "personnelType", "rank", "title", "leaveReason"];

const EMPLOYMENT_CREATE_FIELDS = [
  "employeeId",
  "isActive",
  "joinDate",
  "leaveDate",
  "leaveReason",
  "leaveNote",
  "officeLocation",
  "personnelType",
  "rank",
  "title",
  "contracts",
] as const;

export const EMPLOYMENT_ALLOWED_FIELDS = [
  "isActive",
  "joinDate",
  "leaveDate",
  "leaveReason",
  "leaveNote",
  "officeLocation",
  "personnelType",
  "rank",
  "title",
  "contracts",
];

export interface EmploymentFieldUpdateCommand {
  field: string;
  value: unknown;
}

function validateEmploymentOptions(data: Record<string, unknown>) {
  for (const field of OPTION_FIELDS) {
    if (!validateEmploymentOption(field, data[field])) return field;
  }
  return null;
}

function parseEmployeeId(value: unknown) {
  const employeeId = Number(value);
  return Number.isInteger(employeeId) && employeeId > 0 ? employeeId : null;
}

export async function buildEmploymentCreateCommand(
  body: Record<string, unknown>,
): Promise<DomainValidationResult<Record<string, unknown>>> {
  const employeeId = parseEmployeeId(body.employeeId);
  if (!employeeId) return failCommand("员工不能为空");
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true },
  });
  if (!employee) return failCommand("员工不存在");
  for (const field of DATE_FIELDS) {
    if (!isValidDateValue(body[field])) return failCommand("日期格式无效");
  }
  if (validateEmploymentOptions(body)) return failCommand("字段值不在允许范围内");
  const safeBody: Record<string, unknown> = {};
  for (const field of EMPLOYMENT_CREATE_FIELDS) {
    if (field in body) safeBody[field] = field === "employeeId" ? employeeId : body[field];
  }
  return okCommand(safeBody);
}

export async function buildEmploymentFieldUpdateCommand(
  field: string,
  value: unknown,
  _id?: number,
): Promise<DomainValidationResult<EmploymentFieldUpdateCommand>> {
  if (field === "employeeId") return failCommand("雇佣记录员工不可修改");
  const dateResult = rejectInvalidDateField(field, value, DATE_FIELDS);
  if (!dateResult) return failCommand("日期格式无效");
  const optionResult = validateEmploymentOption(field, value);
  if (!optionResult) return failCommand("字段值不在允许范围内");
  return okCommand({ field, value });
}
