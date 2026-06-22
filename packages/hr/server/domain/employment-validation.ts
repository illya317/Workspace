import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import { prisma } from "@workspace/platform/server/prisma";
import { isValidDateValue, rejectInvalidDateField, validateEmploymentOption } from "../field-validation";
import { guardEmployeeInactive } from "../reference-guards";

const DATE_FIELDS = ["joinDate", "leaveDate"];
const OPTION_FIELDS = ["officeLocation", "personnelType", "rank", "title", "leaveReason"];

export const EMPLOYMENT_ALLOWED_FIELDS = [
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

export function buildEmploymentCreateCommand(
  body: Record<string, unknown>,
): DomainValidationResult<Record<string, unknown>> {
  if (!body.employeeId) return failCommand("员工不能为空");
  for (const field of DATE_FIELDS) {
    if (!isValidDateValue(body[field])) return failCommand("日期格式无效");
  }
  if (validateEmploymentOptions(body)) return failCommand("字段值不在允许范围内");
  const safeBody = { ...body };
  delete safeBody.currentCompany;
  delete safeBody.attendanceType;
  return okCommand(safeBody);
}

export async function buildEmploymentFieldUpdateCommand(
  field: string,
  value: unknown,
  id?: number,
): Promise<DomainValidationResult<EmploymentFieldUpdateCommand>> {
  const dateResult = rejectInvalidDateField(field, value, DATE_FIELDS);
  if (!dateResult) return failCommand("日期格式无效");
  const optionResult = validateEmploymentOption(field, value);
  if (!optionResult) return failCommand("字段值不在允许范围内");
  if (field === "isActive" && (value === false || value === "false") && id) {
    const employment = await prisma.employment.findUnique({
      where: { id },
      select: { employeeId: true },
    });
    if (!employment) return failCommand("雇佣记录不存在", 404);
    const otherActiveCount = await prisma.employment.count({
      where: { employeeId: employment.employeeId, id: { not: id }, isActive: true },
    });
    if (otherActiveCount === 0) {
      const blockMessage = await guardEmployeeInactive(employment.employeeId);
      if (blockMessage) return failCommand(blockMessage, 409);
    }
  }
  return okCommand({ field, value });
}
