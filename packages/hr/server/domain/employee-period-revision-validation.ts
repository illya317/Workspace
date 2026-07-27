import {
  businessDateWindowsOverlap,
  businessTemporalRetrospectiveChanges,
  inclusiveBusinessPeriodToWindow,
  parseBusinessDate,
} from "@workspace/platform/contracts/business-temporal";
import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import { prisma } from "@workspace/platform/server/prisma";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import { HR_ASSIGNMENT_TEMPORAL, HR_EMPLOYMENT_TEMPORAL } from "../../business-temporal";
import { validateAssignmentTimeline } from "./employee-lifecycle-validation";

export type EmployeePeriodRevisionInput = {
  entityType?: unknown;
  periodId?: unknown;
  expectedVersion?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  reason?: unknown;
};

export type EmployeePeriodRevisionCommand = {
  employeeId: number;
  userId: number;
  entityType: "Employment" | "EDP";
  periodId: number;
  expectedVersion: number;
  startDate: string;
  endDate: string | null;
  reason: string;
};

export async function buildEmployeePeriodRevisionCommand(
  employeeId: number,
  input: EmployeePeriodRevisionInput,
  userId: number,
): Promise<DomainValidationResult<EmployeePeriodRevisionCommand>> {
  if (!Number.isInteger(employeeId) || employeeId <= 0) return failCommand("员工ID无效", 400, "employeeId");
  const entityType = input.entityType === "Employment" || input.entityType === "EDP" ? input.entityType : null;
  if (!entityType) return failCommand("周期类型无效", 400, "entityType");
  const periodId = positiveInteger(input.periodId);
  if (!periodId) return failCommand("周期记录无效", 400, "periodId");
  const expectedVersion = positiveInteger(input.expectedVersion);
  if (!expectedVersion) return failCommand("周期版本无效", 400, "expectedVersion");
  const startDate = parseBusinessDate(input.startDate);
  if (!startDate) return failCommand("开始日期无效", 400, "startDate");
  const endDate = input.endDate == null || input.endDate === "" ? null : parseBusinessDate(input.endDate);
  if (input.endDate != null && input.endDate !== "" && !endDate) return failCommand("结束日期无效", 400, "endDate");
  if (endDate && startDate > endDate) return failCommand("开始日期不能晚于结束日期", 409, "endDate");
  const reason = text(input.reason);
  if (!reason) return failCommand("周期修订必须填写原因", 400, "reason");

  const registration = entityType === "Employment" ? HR_EMPLOYMENT_TEMPORAL : HR_ASSIGNMENT_TEMPORAL;
  if (registration.policy.revision === "forbid") return failCommand("该周期不允许修订", 409);
  if (
    businessTemporalRetrospectiveChanges(registration.policy) === "forbid"
    && startDate < workspaceBusinessDate(new Date())
  ) {
    return failCommand("该周期不允许补录历史日期", 409, "startDate");
  }

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      employments: { select: { id: true, version: true, joinDate: true, leaveDate: true, isActive: true } },
      positions: { select: { id: true, version: true, startDate: true, endDate: true, allocationWeight: true, isPrimary: true } },
    },
  });
  if (!employee) return failCommand("员工不存在", 404);

  if (entityType === "Employment") {
    const current = employee.employments.find((row) => row.id === periodId);
    if (!current) return failCommand("雇佣周期不存在", 404);
    if (current.version !== expectedVersion) return failCommand("雇佣周期已被修改，请刷新后重试", 409);
    const proposed = employee.employments.map((row) => row.id === periodId
      ? { ...row, joinDate: startDate, leaveDate: endDate }
      : row);
    if (registration.policy.overlaps === "forbid" && hasEmploymentOverlap(proposed)) {
      return failCommand("雇佣周期不能与其他雇佣周期重叠", 409);
    }
    const uncovered = employee.positions.find((position) => !proposed.some((employment) => periodContains(
      { startDate: employment.joinDate, endDate: employment.leaveDate },
      position,
    )));
    if (uncovered) return failCommand("修订后会有任职周期落在雇佣周期之外，请先修订对应任职历史", 409);
  } else {
    const current = employee.positions.find((row) => row.id === periodId);
    if (!current) return failCommand("任职周期不存在", 404);
    if (current.version !== expectedVersion) return failCommand("任职周期已被修改，请刷新后重试", 409);
    if (!employee.employments.some((employment) => periodContains(
      { startDate: employment.joinDate, endDate: employment.leaveDate },
      { startDate, endDate },
    ))) {
      return failCommand("任职周期必须完整落在某一雇佣周期内", 409);
    }
    const proposed = employee.positions.map((row) => row.id === periodId
      ? { ...row, startDate, endDate }
      : row);
    const timelineError = validateAssignmentTimeline(proposed, startDate);
    if (timelineError) return failCommand(timelineError, 409);
  }

  return okCommand({ employeeId, userId, entityType, periodId, expectedVersion, startDate, endDate, reason });
}

function hasEmploymentOverlap(rows: Array<{ joinDate: string | null; leaveDate: string | null }>) {
  const windows = rows.map((row) => inclusiveBusinessPeriodToWindow({ validFrom: row.joinDate, validThrough: row.leaveDate }));
  for (let left = 0; left < windows.length; left += 1) {
    for (let right = left + 1; right < windows.length; right += 1) {
      if (!windows[left] || !windows[right] || businessDateWindowsOverlap(windows[left]!, windows[right]!)) return true;
    }
  }
  return false;
}

function periodContains(
  outer: { startDate?: string | null; endDate?: string | null },
  inner: { startDate?: string | null; endDate?: string | null },
) {
  if (!inner.startDate) return false;
  if (outer.startDate && outer.startDate > inner.startDate) return false;
  if (!outer.endDate) return true;
  return Boolean(inner.endDate && inner.endDate <= outer.endDate);
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function text(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}
