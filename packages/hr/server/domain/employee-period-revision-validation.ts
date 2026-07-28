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
import { resolveEdpPositionAssignment } from "./position-report-override-validation";
import { validateEdpReportToPosition } from "../edp-report-to";
import { isValidCompanyName, parseAllocationWeight } from "../field-validation";

export type EmployeePeriodRevisionInput = {
  entityType?: unknown;
  periodId?: unknown;
  expectedVersion?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  currentCompany?: unknown;
  reportingCompanyId?: unknown;
  departmentId?: unknown;
  positionId?: unknown;
  isPrimary?: unknown;
  allocationWeight?: unknown;
  reportToPositionId?: unknown;
  reason?: unknown;
};

type EmployeePeriodRevisionCommandBase = {
  employeeId: number;
  userId: number;
  periodId: number;
  expectedVersion: number;
  startDate: string;
  endDate: string | null;
  reason: string;
};

export type EmployeePeriodRevisionCommand =
  | (EmployeePeriodRevisionCommandBase & {
      entityType: "Employment";
      currentCompany: string | null;
    })
  | (EmployeePeriodRevisionCommandBase & {
      entityType: "EDP";
      reportingCompanyId: number;
      departmentId: number;
      positionId: number;
      positionReportOverrideId: number | null;
      isPrimary: boolean;
      allocationWeight: string;
      reportToPositionId: number | null;
    });

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
  if (revisionIsForbidden(registration.policy.revision)) return failCommand("该周期不允许修订", 409);
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
      positions: {
        select: {
          id: true,
          version: true,
          reportingCompanyId: true,
          departmentId: true,
          positionId: true,
          positionReportOverrideId: true,
          startDate: true,
          endDate: true,
          allocationWeight: true,
          isPrimary: true,
          reportToPositionId: true,
        },
      },
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
    const currentCompany = text(input.currentCompany);
    if (!(await isValidCompanyName(currentCompany))) return failCommand("用工公司不存在", 400, "currentCompany");
    return okCommand({
      employeeId,
      userId,
      entityType,
      periodId,
      expectedVersion,
      startDate,
      endDate,
      currentCompany,
      reason,
    });
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
    const reportingCompanyId = requiredPositiveInteger(input.reportingCompanyId);
    if (!reportingCompanyId) return failCommand("汇报公司必填", 400, "reportingCompanyId");
    const departmentId = requiredPositiveInteger(input.departmentId);
    if (!departmentId) return failCommand("部门必填", 400, "departmentId");
    const positionId = requiredPositiveInteger(input.positionId);
    if (!positionId) return failCommand("岗位必填", 400, "positionId");
    if (typeof input.isPrimary !== "boolean") return failCommand("主岗状态无效", 400, "isPrimary");
    const allocationWeight = text(input.allocationWeight);
    const parsedWeight = parseAllocationWeight(allocationWeight);
    if (!allocationWeight || parsedWeight === null || Number.isNaN(parsedWeight) || parsedWeight <= 0) {
      return failCommand("岗位投入权重必须大于 0", 400, "allocationWeight");
    }
    const placement = await resolveEdpPositionAssignment({ reportingCompanyId, departmentId, positionId });
    if (!placement.ok) return placement;
    if (!placement.data.reportingCompanyId || !placement.data.departmentId) {
      return failCommand("任职的汇报公司和部门必须完整", 400);
    }
    const reportTo = await validateEdpReportToPosition({
      positionId,
      departmentId: placement.data.departmentId,
      reportToPositionId: input.reportToPositionId,
    });
    if (!reportTo.ok) return reportTo;
    const corrected = {
      ...current,
      reportingCompanyId: placement.data.reportingCompanyId,
      departmentId: placement.data.departmentId,
      positionId,
      positionReportOverrideId: placement.data.positionReportOverrideId,
      startDate,
      endDate,
      allocationWeight,
      isPrimary: input.isPrimary,
      reportToPositionId: reportTo.data,
    };
    const proposed = employee.positions.map((row) => row.id === periodId ? corrected : row);
    const timelineError = validateAssignmentTimeline(proposed, startDate);
    if (timelineError) return failCommand(timelineError, 409);
    return okCommand({
      employeeId,
      userId,
      entityType,
      periodId,
      expectedVersion,
      startDate,
      endDate,
      reportingCompanyId: corrected.reportingCompanyId,
      departmentId: corrected.departmentId,
      positionId: corrected.positionId,
      positionReportOverrideId: corrected.positionReportOverrideId,
      isPrimary: corrected.isPrimary,
      allocationWeight: corrected.allocationWeight,
      reportToPositionId: corrected.reportToPositionId,
      reason,
    });
  }
}

function revisionIsForbidden(value: string) {
  return value === "forbid";
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

function requiredPositiveInteger(value: unknown) {
  const parsed = positiveInteger(value);
  return parsed && !Number.isNaN(parsed) ? parsed : null;
}

function text(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}
