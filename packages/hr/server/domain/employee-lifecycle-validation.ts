import {
  businessDateWindowContains,
  inclusiveBusinessPeriodToWindow,
  LATEST_INCLUSIVE_BUSINESS_DATE,
  parseBusinessDate,
} from "@workspace/platform/contracts/business-temporal";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import { employmentIsActiveOnDate } from "@workspace/platform/server/relation-registry";
import { prisma } from "@workspace/platform/server/prisma";
import { isEmploymentPositionOptionalTitle } from "@workspace/hr/constants/employee-temporal-write-policy";
import {
  resolveDefaultEdpReportToPositionId,
  validateEdpReportToPosition,
} from "../edp-report-to";
import { parseWorkPercent, validateEmploymentOption } from "../field-validation";
import { resolveEdpPositionAssignment } from "./position-report-override-validation";
import { assignmentPeriodContainsDate } from "./employee-business-temporal";

export const EMPLOYEE_LIFECYCLE_EVENT_TYPES = [
  "onboard",
  "transfer",
  "concurrent_assignment",
  "reporting_change",
  "offboard",
] as const;

export type EmployeeLifecycleEventType = typeof EMPLOYEE_LIFECYCLE_EVENT_TYPES[number];

export interface EmployeeLifecycleInput {
  eventType?: unknown;
  effectiveDate?: unknown;
  reason?: unknown;
  sourceAssignmentId?: unknown;
  assignmentEndDate?: unknown;
  reportingCompanyId?: unknown;
  departmentId?: unknown;
  positionId?: unknown;
  positionReportOverrideId?: unknown;
  reportToPositionId?: unknown;
  workPercent?: unknown;
  officeLocation?: unknown;
  personnelType?: unknown;
  rank?: unknown;
  title?: unknown;
  leaveReason?: unknown;
  leaveNote?: unknown;
}

export interface LifecycleAssignmentPeriod {
  id: number | null;
  version: number;
  employeeId: number;
  reportingCompanyId: number | null;
  departmentId: number | null;
  positionId: number;
  positionReportOverrideId: number | null;
  isPrimary: boolean;
  startDate: string | null;
  endDate: string | null;
  reportTo: string | null;
  reportToPositionId: number | null;
  workPercent: string;
}

export interface EmployeeLifecycleCommand {
  employeeId: number;
  userId: number;
  eventType: EmployeeLifecycleEventType;
  effectiveDate: string;
  reason: string | null;
  sourceAssignment: LifecycleAssignmentPeriod | null;
  targetAssignment: LifecycleAssignmentPeriod | null;
  sourceRemainingWorkPercent: string | null;
  assignmentEndDate: string | null;
  employment: {
    id: number;
    version: number;
    joinDate: string | null;
    leaveDate: string | null;
    isActive: boolean;
  } | null;
  employmentFields: {
    officeLocation: string | null;
    personnelType: string | null;
    rank: string | null;
    title: string | null;
    leaveReason: string | null;
    leaveNote: string | null;
  };
}

export function isHydratableOnboardingPlaceholder(
  employments: ReadonlyArray<{ isActive: boolean; joinDate: string | null; leaveDate: string | null }>,
  assignmentCount: number,
  lifecycleEventCount: number,
) {
  if (employments.length !== 1 || assignmentCount !== 0 || lifecycleEventCount !== 0) return false;
  const employment = employments[0]!;
  return employment.isActive
    && !employment.joinDate?.trim()
    && !employment.leaveDate?.trim();
}

type TimelineRow = Pick<LifecycleAssignmentPeriod, "startDate" | "endDate" | "workPercent" | "isPrimary">;

export function validateAssignmentChange(
  eventType: "transfer" | "reporting_change",
  source: LifecycleAssignmentPeriod,
  target: LifecycleAssignmentPeriod,
) {
  if (
    eventType === "transfer"
    && source.reportingCompanyId === target.reportingCompanyId
    && source.departmentId === target.departmentId
    && source.positionId === target.positionId
    && source.positionReportOverrideId === target.positionReportOverrideId
  ) {
    return "目标岗位与来源岗位相同，无需登记调岗";
  }
  if (
    eventType === "reporting_change"
    && source.reportToPositionId === target.reportToPositionId
  ) {
    return "汇报岗位未发生变化，无需登记变更";
  }
  return null;
}

function text(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function positiveInteger(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : Number.NaN;
}

function employmentContainsDate(
  employment: { isActive: boolean; joinDate: string | null; leaveDate: string | null },
  date: string,
) {
  return employmentIsActiveOnDate({
    isActive: employment.isActive,
    joinDate: employment.joinDate,
    leaveDate: employment.leaveDate,
  }, date);
}

function employmentPeriodsOverlap(
  employment: { isActive: boolean; joinDate: string | null; leaveDate: string | null },
  startDate: string,
) {
  if (!employment.joinDate && !employment.leaveDate && !employment.isActive) return false;
  return !employment.leaveDate || employment.leaveDate >= startDate;
}

function normalizeDate(
  value: unknown,
  label: string,
  required: boolean,
  options: { inclusiveEnd?: boolean } = {},
) {
  const normalized = text(value);
  if (!normalized && !required) return okCommand<string | null>(null);
  const parsed = parseBusinessDate(normalized);
  if (!parsed) return failCommand(`${label}格式无效`);
  if (options.inclusiveEnd && parsed > LATEST_INCLUSIVE_BUSINESS_DATE) {
    return failCommand(`${label}不能晚于 ${LATEST_INCLUSIVE_BUSINESS_DATE}；开放结束请留空`);
  }
  return okCommand(parsed);
}

export function validateAssignmentTimeline(
  rows: TimelineRow[],
  fromDate: string,
  options: { requireAssignmentAtFromDate?: boolean } = {},
) {
  const normalizedFromDate = parseBusinessDate(fromDate);
  if (!normalizedFromDate) return "岗位期间校验基准日期格式无效";
  const periods = rows.map((row) => ({
    row,
    window: inclusiveBusinessPeriodToWindow({
      validFrom: row.startDate,
      validThrough: row.endDate,
    }),
  }));
  for (const row of rows) {
    if ((row.startDate && !parseBusinessDate(row.startDate)) || (row.endDate && !parseBusinessDate(row.endDate))) {
      return "岗位期间日期格式无效";
    }
    if (row.startDate && row.endDate && row.startDate > row.endDate) return "岗位期间的开始日期不能晚于结束日期";
  }
  if (periods.some((period) => !period.window)) {
    return `岗位期间的包含式结束日期不能晚于 ${LATEST_INCLUSIVE_BUSINESS_DATE}；开放结束请留空`;
  }
  const boundaries = new Set<string>([normalizedFromDate]);
  for (const period of periods) {
    const window = period.window!;
    if (window.validFrom && window.validFrom >= normalizedFromDate) boundaries.add(window.validFrom);
    if (window.validToExclusive && window.validToExclusive >= normalizedFromDate) boundaries.add(window.validToExclusive);
  }
  for (const date of [...boundaries].sort()) {
    const active = periods
      .filter((period) => businessDateWindowContains(period.window!, date))
      .map((period) => period.row);
    if (active.length === 0) {
      if (options.requireAssignmentAtFromDate && date === normalizedFromDate) {
        return `${date} 生效时必须至少存在一条当前任职`;
      }
      continue;
    }
    const percentages = active.map((row) => parseWorkPercent(row.workPercent));
    if (percentages.some((value) => value === null || Number.isNaN(value))) {
      return `${date} 生效的岗位工作占比必须完整填写`;
    }
    const total = percentages.reduce<number>((sum, value) => sum + (value ?? 0), 0);
    if (Math.abs(total - 1) > 0.0001) return `${date} 生效的岗位工作占比合计必须为 100%，当前为 ${(total * 100).toFixed(2)}%`;
    if (active.filter((row) => row.isPrimary).length !== 1) return `${date} 生效的岗位必须且只能有一个主岗`;
  }
  return null;
}

function normalizeEmploymentFields(input: EmployeeLifecycleInput) {
  const values = {
    officeLocation: text(input.officeLocation),
    personnelType: text(input.personnelType),
    rank: text(input.rank),
    title: text(input.title),
    leaveReason: text(input.leaveReason),
    leaveNote: text(input.leaveNote),
  };
  for (const field of ["officeLocation", "personnelType", "rank", "title", "leaveReason"] as const) {
    if (!validateEmploymentOption(field, values[field])) return failCommand("字段值不在允许范围内", 400, field);
  }
  return okCommand(values);
}

async function normalizeTargetAssignment(
  employeeId: number,
  input: EmployeeLifecycleInput,
  effectiveDate: string,
  defaults?: LifecycleAssignmentPeriod,
  reportingMode: "default" | "explicit" = "default",
): Promise<DomainValidationResult<LifecycleAssignmentPeriod>> {
  const positionId = positiveInteger(input.positionId ?? defaults?.positionId);
  if (!positionId || Number.isNaN(positionId)) return failCommand("岗位必填", 400, "positionId");
  const reportingCompanyId = positiveInteger(input.reportingCompanyId ?? defaults?.reportingCompanyId);
  if (!reportingCompanyId || Number.isNaN(reportingCompanyId)) return failCommand("汇报公司必填", 400, "reportingCompanyId");
  const departmentId = positiveInteger(input.departmentId ?? defaults?.departmentId);
  if (!departmentId || Number.isNaN(departmentId)) return failCommand("部门必填", 400, "departmentId");
  const overrideId = positiveInteger(input.positionReportOverrideId ?? defaults?.positionReportOverrideId);
  if (Number.isNaN(overrideId)) return failCommand("特殊汇报配置无效", 400, "positionReportOverrideId");
  const assignment = await resolveEdpPositionAssignment({
    positionId,
    reportingCompanyId,
    departmentId,
    positionReportOverrideId: overrideId,
  });
  if (!assignment.ok) return failCommand(assignment.issue.message, assignment.issue.status);
  if (!assignment.data.reportingCompanyId) return failCommand("汇报公司必填", 400, "reportingCompanyId");
  if (!assignment.data.departmentId) return failCommand("部门必填", 400, "departmentId");
  const reportToPosition = reportingMode === "explicit"
    ? await validateEdpReportToPosition({
        positionId,
        departmentId: assignment.data.departmentId,
        reportToPositionId: input.reportToPositionId,
      })
    : okCommand(await resolveDefaultEdpReportToPositionId({
        positionId,
        reportingCompanyId: assignment.data.reportingCompanyId,
        departmentId: assignment.data.departmentId,
        positionReportOverrideId: assignment.data.positionReportOverrideId,
      }));
  if (!reportToPosition.ok) return reportToPosition;
  const workPercent = text(input.workPercent) ?? defaults?.workPercent ?? null;
  const parsedPercent = parseWorkPercent(workPercent);
  if (!workPercent || parsedPercent === null || Number.isNaN(parsedPercent) || parsedPercent <= 0 || parsedPercent > 1) {
    return failCommand("工作占比必须大于 0 且不超过 100%", 400, "workPercent");
  }
  return okCommand({
    id: null,
    version: 0,
    employeeId,
    reportingCompanyId: assignment.data.reportingCompanyId,
    departmentId: assignment.data.departmentId,
    positionId,
    positionReportOverrideId: assignment.data.positionReportOverrideId,
    isPrimary: defaults?.isPrimary ?? true,
    startDate: effectiveDate,
    endDate: defaults?.endDate ?? null,
    reportTo: null,
    reportToPositionId: reportToPosition.data,
    workPercent,
  });
}

export async function buildEmployeeLifecycleCommand(
  employeeId: number,
  input: EmployeeLifecycleInput,
  userId: number,
): Promise<DomainValidationResult<EmployeeLifecycleCommand>> {
  if (!Number.isInteger(employeeId) || employeeId <= 0) return failCommand("员工ID无效");
  const eventType = text(input.eventType) as EmployeeLifecycleEventType | null;
  if (!eventType || !EMPLOYEE_LIFECYCLE_EVENT_TYPES.includes(eventType)) return failCommand("生命周期事件类型无效");
  const effectiveDateResult = normalizeDate(input.effectiveDate, "生效日期", true);
  if (!effectiveDateResult.ok) return effectiveDateResult;
  const effectiveDate = effectiveDateResult.data;
  if (!effectiveDate) return failCommand("生效日期必填");
  const today = workspaceBusinessDate(new Date());
  if (effectiveDate < today) return failCommand("生效日期不能早于当前业务日期");
  const assignmentEndDateResult = normalizeDate(
    input.assignmentEndDate,
    "兼岗结束日期",
    false,
    { inclusiveEnd: true },
  );
  if (!assignmentEndDateResult.ok) return assignmentEndDateResult;
  const assignmentEndDate = assignmentEndDateResult.data;
  if (assignmentEndDate && assignmentEndDate < effectiveDate) return failCommand("兼岗结束日期不能早于生效日期");
  const employmentFields = normalizeEmploymentFields(input);
  if (!employmentFields.ok) return employmentFields;

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      employments: { select: { id: true, version: true, isActive: true, joinDate: true, leaveDate: true } },
      positions: {
        select: {
          id: true,
          version: true,
          employeeId: true,
          reportingCompanyId: true,
          departmentId: true,
          positionId: true,
          positionReportOverrideId: true,
          isPrimary: true,
          startDate: true,
          endDate: true,
          reportTo: true,
          reportToPositionId: true,
          workPercent: true,
        },
      },
      lifecycleEvents: { select: { id: true }, take: 1 },
    },
  });
  if (!employee) return failCommand("员工不存在", 404);

  const sourceAssignmentId = positiveInteger(input.sourceAssignmentId);
  if (Number.isNaN(sourceAssignmentId)) return failCommand("来源岗位无效");
  const source = sourceAssignmentId
    ? employee.positions.find((row) => row.id === sourceAssignmentId) ?? null
    : null;
  if (eventType !== "onboard" && eventType !== "offboard") {
    if (!source || !source.positionId || !source.workPercent) return failCommand("请选择生效日覆盖中的来源岗位", 400, "sourceAssignmentId");
    if (!assignmentPeriodContainsDate(source, effectiveDate)) return failCommand("来源岗位在生效日不处于有效期间");
    if (source.startDate && source.startDate >= effectiveDate) return failCommand("生效日必须晚于来源岗位开始日期");
  }
  const sourceAssignment: LifecycleAssignmentPeriod | null = source?.positionId && source.workPercent
    ? { ...source, positionId: source.positionId, workPercent: source.workPercent }
    : null;

  const activeEmployments = employee.employments.filter((row) => employmentContainsDate(row, effectiveDate));
  const activeEmployment = activeEmployments[0] ?? null;
  const onboardingPlaceholder = eventType === "onboard"
    && isHydratableOnboardingPlaceholder(
      employee.employments,
      employee.positions.length,
      employee.lifecycleEvents.length,
    )
    ? employee.employments[0]!
    : null;
  if (eventType === "onboard") {
    if (!onboardingPlaceholder && employee.employments.some((row) => employmentPeriodsOverlap(row, effectiveDate))) {
      return failCommand("该员工在生效日之后已有重叠的雇佣期间");
    }
  } else if (!activeEmployment) {
    return failCommand("该员工在生效日没有有效雇佣期间");
  } else if (activeEmployments.length > 1) {
    return failCommand("该员工在生效日存在多条有效雇佣期间，请先修正资料");
  }

  let targetAssignment: LifecycleAssignmentPeriod | null = null;
  let sourceRemainingWorkPercent: string | null = null;
  if (eventType === "onboard" && isEmploymentPositionOptionalTitle(employmentFields.data.title)) {
    targetAssignment = null;
  } else if (eventType === "onboard" || eventType === "transfer") {
    const target = await normalizeTargetAssignment(employeeId, input, effectiveDate, sourceAssignment ?? undefined);
    if (!target.ok) return target;
    if (eventType === "transfer" && sourceAssignment) {
      const changeError = validateAssignmentChange(eventType, sourceAssignment, target.data);
      if (changeError) return failCommand(changeError, 400, "positionId");
    }
    targetAssignment = target.data;
  } else if (eventType === "concurrent_assignment") {
    const target = await normalizeTargetAssignment(employeeId, input, effectiveDate);
    if (!target.ok) return target;
    const sourcePercent = parseWorkPercent(source!.workPercent);
    const concurrentPercent = parseWorkPercent(target.data.workPercent);
    if (!sourcePercent || !concurrentPercent || concurrentPercent >= sourcePercent) {
      return failCommand("兼岗占比必须小于来源岗位当前占比", 400, "workPercent");
    }
    if (assignmentEndDate && source!.endDate && assignmentEndDate > source!.endDate) {
      return failCommand("兼岗结束日期不能晚于来源岗位结束日期", 400, "assignmentEndDate");
    }
    sourceRemainingWorkPercent = String(Number((sourcePercent - concurrentPercent).toFixed(6)));
    targetAssignment = { ...target.data, isPrimary: false, endDate: assignmentEndDate ?? source!.endDate };
  } else if (eventType === "reporting_change") {
    const target = await normalizeTargetAssignment(employeeId, input, effectiveDate, sourceAssignment!, "explicit");
    if (!target.ok) return target;
    const changeError = validateAssignmentChange(eventType, sourceAssignment!, target.data);
    if (changeError) return failCommand(changeError, 400, "reportToPositionId");
    targetAssignment = target.data;
  }

  if (eventType === "offboard" && !employmentFields.data.leaveReason) {
    return failCommand("离职原因必填", 400, "leaveReason");
  }
  if (eventType === "offboard" && activeEmployment?.joinDate && activeEmployment.joinDate >= effectiveDate) {
    return failCommand("离职生效日期必须晚于入职日期", 400, "effectiveDate");
  }

  return okCommand({
    employeeId,
    userId,
    eventType,
    effectiveDate,
    reason: text(input.reason),
    sourceAssignment,
    targetAssignment,
    sourceRemainingWorkPercent,
    assignmentEndDate,
    employment: eventType === "onboard" ? onboardingPlaceholder : activeEmployment,
    employmentFields: employmentFields.data,
  });
}
