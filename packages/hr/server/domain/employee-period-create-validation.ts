import {
  businessDateWindowsOverlap,
  inclusiveBusinessPeriodToWindow,
  parseBusinessDate,
} from "@workspace/platform/contracts/business-temporal";
import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import type { Prisma } from "@workspace/platform/server/prisma";
import { parseAllocationWeight, validateEmploymentOption } from "../field-validation";
import {
  validateAssignmentPlacement,
  type AssignmentState,
} from "./employee-period-correction-validation";
import { validateAssignmentTimeline } from "./employee-lifecycle-validation";
import { validateEmploymentPersonnelTypeTransition } from "./employment-validation";

export type EmploymentPeriodCreateInput = {
  joinDate?: unknown;
  leaveDate?: unknown;
  leaveReason?: unknown;
  leaveNote?: unknown;
  officeLocation?: unknown;
  personnelType?: unknown;
  rank?: unknown;
  title?: unknown;
};

export type EmployeeAssignmentCreateInput = {
  reportingCompanyId?: unknown;
  departmentId?: unknown;
  positionId?: unknown;
  positionReportOverrideId?: unknown;
  isPrimary?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  reportToPositionId?: unknown;
  allocationWeight?: unknown;
};

export type EmploymentPeriodCreateCommand = {
  employeeId: number;
  userId: number;
  joinDate: string;
  leaveDate: string | null;
  leaveReason: string | null;
  leaveNote: string | null;
  officeLocation: string | null;
  personnelType: string | null;
  rank: string | null;
  title: string | null;
};

export type EmployeeAssignmentCreateCommand = Omit<AssignmentState, "id" | "version" | "reportTo"> & {
  userId: number;
};

export function buildEmploymentPeriodCreateCommand(
  input: EmploymentPeriodCreateInput & { employeeId?: unknown; userId?: unknown },
): DomainValidationResult<EmploymentPeriodCreateCommand> {
  const employeeId = positiveInteger(input.employeeId);
  const userId = positiveInteger(input.userId);
  if (!employeeId) return failCommand("员工ID无效", 400, "employeeId");
  if (!userId) return failCommand("操作人无效", 400, "userId");
  const joinDate = businessDate(input.joinDate, "入职日期", true);
  if (!joinDate.ok || !joinDate.data) return joinDate as DomainValidationResult<EmploymentPeriodCreateCommand>;
  const leaveDate = businessDate(input.leaveDate, "离职日期", false);
  if (!leaveDate.ok) return leaveDate;
  if (leaveDate.data && joinDate.data > leaveDate.data) return failCommand("入职日期不能晚于离职日期", 409, "leaveDate");
  const values = {
    leaveReason: text(input.leaveReason),
    leaveNote: text(input.leaveNote),
    officeLocation: text(input.officeLocation),
    personnelType: text(input.personnelType),
    rank: text(input.rank),
    title: text(input.title),
  };
  for (const field of ["leaveReason", "officeLocation", "personnelType", "rank", "title"] as const) {
    if (!validateEmploymentOption(field, values[field])) return failCommand("字段值不在允许范围内", 400, field);
  }
  const personnelType = validateEmploymentPersonnelTypeTransition(null, values.personnelType);
  if (!personnelType.ok) return personnelType;
  return okCommand({ employeeId, userId, joinDate: joinDate.data, leaveDate: leaveDate.data, ...values });
}

export function buildEmployeeAssignmentCreateCommand(
  employeeIdValue: unknown,
  input: EmployeeAssignmentCreateInput,
  userIdValue: unknown,
): DomainValidationResult<EmployeeAssignmentCreateCommand> {
  const employeeId = positiveInteger(employeeIdValue);
  const userId = positiveInteger(userIdValue);
  if (!employeeId) return failCommand("员工ID无效", 400, "employeeId");
  if (!userId) return failCommand("操作人无效", 400, "userId");
  const reportingCompanyId = requiredId(input.reportingCompanyId, "汇报公司", "reportingCompanyId");
  if (!reportingCompanyId.ok) return reportingCompanyId;
  const departmentId = requiredId(input.departmentId, "任职部门", "departmentId");
  if (!departmentId.ok) return departmentId;
  const positionId = requiredId(input.positionId, "任职岗位", "positionId");
  if (!positionId.ok) return positionId;
  const positionReportOverrideId = optionalId(input.positionReportOverrideId, "positionReportOverrideId");
  if (!positionReportOverrideId.ok) return positionReportOverrideId;
  const reportToPositionId = optionalId(input.reportToPositionId, "reportToPositionId");
  if (!reportToPositionId.ok) return reportToPositionId;
  if (typeof input.isPrimary !== "boolean") return failCommand("主岗值无效", 400, "isPrimary");
  const startDate = businessDate(input.startDate, "任职开始日期", true);
  if (!startDate.ok || !startDate.data) return startDate as DomainValidationResult<EmployeeAssignmentCreateCommand>;
  const endDate = businessDate(input.endDate, "任职结束日期", false);
  if (!endDate.ok) return endDate;
  if (endDate.data && startDate.data > endDate.data) return failCommand("任职开始日期不能晚于结束日期", 409, "endDate");
  const allocationWeight = text(input.allocationWeight);
  const parsedWeight = parseAllocationWeight(allocationWeight);
  if (!allocationWeight || parsedWeight === null || Number.isNaN(parsedWeight) || parsedWeight <= 0) {
    return failCommand("岗位投入权重必须大于0", 400, "allocationWeight");
  }
  return okCommand({
    employeeId,
    userId,
    reportingCompanyId: reportingCompanyId.data,
    departmentId: departmentId.data,
    positionId: positionId.data,
    positionReportOverrideId: positionReportOverrideId.data,
    isPrimary: input.isPrimary,
    startDate: startDate.data,
    endDate: endDate.data,
    reportToPositionId: reportToPositionId.data,
    allocationWeight,
  });
}

export async function validateEmploymentPeriodCreateState(
  tx: Prisma.TransactionClient,
  command: EmploymentPeriodCreateCommand,
) {
  const [employee, employments, assignments] = await Promise.all([
    tx.employee.findUnique({ where: { id: command.employeeId }, select: { id: true } }),
    tx.employment.findMany({
      where: { employeeId: command.employeeId },
      select: { id: true, version: true, joinDate: true, leaveDate: true, leaveReason: true, leaveNote: true, officeLocation: true, personnelType: true, rank: true, title: true },
    }),
    tx.eDP.findMany({ where: { employeeId: command.employeeId }, select: { startDate: true, endDate: true } }),
  ]);
  if (!employee) return failCommand("员工不存在", 404);
  const replay = employments.find((row) => employmentFactsEqual(row, command));
  if (replay) return okCommand({ replayId: replay.id, replayVersion: replay.version });
  const proposed = [...employments, command];
  if (hasOverlap(proposed.map((row) => ({ startDate: row.joinDate, endDate: row.leaveDate })))) {
    return failCommand("雇佣期间不能与其他雇佣期间重叠", 409);
  }
  if (assignments.some((assignment) => !proposed.some((employment) => contains(employment.joinDate, employment.leaveDate, assignment.startDate, assignment.endDate)))) {
    return failCommand("新增雇佣期间后仍有任职记录不在任何雇佣期间内", 409);
  }
  return okCommand({ replayId: null, replayVersion: null });
}

export async function validateEmployeeAssignmentCreateState(
  tx: Prisma.TransactionClient,
  command: EmployeeAssignmentCreateCommand,
) {
  const [employee, employments, assignments] = await Promise.all([
    tx.employee.findUnique({ where: { id: command.employeeId }, select: { id: true } }),
    tx.employment.findMany({ where: { employeeId: command.employeeId }, select: { joinDate: true, leaveDate: true } }),
    tx.eDP.findMany({ where: { employeeId: command.employeeId }, select: assignmentSelect }),
  ]);
  if (!employee) return failCommand("员工不存在", 404);
  const candidate: AssignmentState = { id: 0, version: 1, reportTo: null, ...command };
  const replay = assignments.find((row) => assignmentFactsEqual(row, candidate));
  if (replay) return okCommand({ replayId: replay.id, replayVersion: replay.version, candidate });
  const placement = await validateAssignmentPlacement(tx, candidate);
  if (!placement.ok) return placement;
  if (!employments.some((employment) => contains(employment.joinDate, employment.leaveDate, candidate.startDate, candidate.endDate))) {
    return failCommand("任职期间必须完整落在某一雇佣期间内", 409);
  }
  const sameSlotOverlap = assignments.some((row) => (
    row.reportingCompanyId === candidate.reportingCompanyId
    && row.departmentId === candidate.departmentId
    && row.positionId === candidate.positionId
    && windowsOverlap(row.startDate, row.endDate, candidate.startDate, candidate.endDate)
  ));
  if (sameSlotOverlap) return failCommand("同一岗位槽位的任职期间不能重叠", 409);
  const timelineError = validateAssignmentTimeline([...assignments, candidate], candidate.startDate!);
  if (timelineError) return failCommand(timelineError, 409);
  return okCommand({ replayId: null, replayVersion: null, candidate });
}

const assignmentSelect = {
  id: true, employeeId: true, version: true, reportingCompanyId: true, departmentId: true,
  positionId: true, positionReportOverrideId: true, isPrimary: true, startDate: true,
  endDate: true, reportTo: true, reportToPositionId: true, allocationWeight: true,
} as const;

function employmentFactsEqual(row: Record<string, unknown>, command: EmploymentPeriodCreateCommand) {
  return ["joinDate", "leaveDate", "leaveReason", "leaveNote", "officeLocation", "personnelType", "rank", "title"]
    .every((field) => row[field] === command[field as keyof EmploymentPeriodCreateCommand]);
}

function assignmentFactsEqual(row: AssignmentState, candidate: AssignmentState) {
  return ["reportingCompanyId", "departmentId", "positionId", "positionReportOverrideId", "isPrimary", "startDate", "endDate", "reportToPositionId", "allocationWeight"]
    .every((field) => row[field as keyof AssignmentState] === candidate[field as keyof AssignmentState]);
}

function businessDate(value: unknown, label: string, required: boolean) {
  if (value === null || value === undefined || value === "") {
    return required ? failCommand<string | null>(`${label}必填`, 400) : okCommand<string | null>(null);
  }
  const parsed = parseBusinessDate(value);
  return parsed ? okCommand<string | null>(parsed) : failCommand<string | null>(`${label}无效`, 400);
}

function requiredId(value: unknown, label: string, field: string) {
  const parsed = positiveInteger(value);
  return parsed ? okCommand(parsed) : failCommand<number>(`${label}无效`, 400, field);
}

function optionalId(value: unknown, field: string) {
  if (value === null || value === undefined || value === "") return okCommand<number | null>(null);
  const parsed = positiveInteger(value);
  return parsed ? okCommand<number | null>(parsed) : failCommand<number | null>("关联记录无效", 400, field);
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function text(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function contains(outerStart: string | null, outerEnd: string | null, innerStart: string | null, innerEnd: string | null) {
  if (!innerStart || (outerStart && outerStart > innerStart)) return false;
  return !outerEnd || Boolean(innerEnd && innerEnd <= outerEnd);
}

function windowsOverlap(leftStart: string | null, leftEnd: string | null, rightStart: string | null, rightEnd: string | null) {
  const left = inclusiveBusinessPeriodToWindow({ validFrom: leftStart, validThrough: leftEnd });
  const right = inclusiveBusinessPeriodToWindow({ validFrom: rightStart, validThrough: rightEnd });
  return !left || !right || businessDateWindowsOverlap(left, right);
}

function hasOverlap(rows: Array<{ startDate: string | null; endDate: string | null }>) {
  for (let left = 0; left < rows.length; left += 1) {
    for (let right = left + 1; right < rows.length; right += 1) {
      if (windowsOverlap(rows[left]!.startDate, rows[left]!.endDate, rows[right]!.startDate, rows[right]!.endDate)) return true;
    }
  }
  return false;
}
