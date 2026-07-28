import {
  businessDateWindowContains,
  businessTemporalRetrospectiveChanges,
  inclusiveBusinessPeriodToWindow,
  LATEST_INCLUSIVE_BUSINESS_DATE,
  parseBusinessDate,
  shiftBusinessDate,
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
  employeeCanOnboardAt,
  isHydratableOnboardingPlaceholder,
} from "@workspace/hr/employee-lifecycle-contract";
import {
  resolveDefaultEdpReportToPositionId,
  validateEdpReportToPosition,
} from "../edp-report-to";
import { parseAllocationWeight, validateEmploymentOption } from "../field-validation";
import { resolveEdpPositionAssignment } from "./position-report-override-validation";
import { assignmentPeriodContainsDate } from "./employee-business-temporal";
import { HR_ASSIGNMENT_TEMPORAL, HR_EMPLOYMENT_TEMPORAL } from "../../business-temporal";

export const EMPLOYEE_LIFECYCLE_EVENT_TYPES = [
  "onboard",
  "transfer",
  "concurrent_assignment",
  "allocation_change",
  "primary_change",
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
  allocationWeight?: unknown;
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
  allocationWeight: string;
}

export interface EmployeeLifecycleCommand {
  employeeId: number;
  userId: number;
  eventType: EmployeeLifecycleEventType;
  effectiveDate: string;
  reason: string | null;
  sourceAssignment: LifecycleAssignmentPeriod | null;
  targetAssignment: LifecycleAssignmentPeriod | null;
  previousPrimaryAssignment: LifecycleAssignmentPeriod | null;
  previousPrimaryTarget: LifecycleAssignmentPeriod | null;
  restoredPrimaryAssignment: LifecycleAssignmentPeriod | null;
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

export { isHydratableOnboardingPlaceholder };

type TimelineRow = {
  startDate: string | null;
  endDate: string | null;
  allocationWeight: string | null;
  isPrimary: boolean;
};

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
    const weights = active.map((row) => parseAllocationWeight(row.allocationWeight));
    if (weights.some((value) => value === null || Number.isNaN(value) || value <= 0)) {
      return `${date} 生效的岗位投入权重必须完整填写且大于 0`;
    }
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
  const allocationWeight = text(input.allocationWeight) ?? defaults?.allocationWeight ?? null;
  const parsedWeight = parseAllocationWeight(allocationWeight);
  if (!allocationWeight || parsedWeight === null || Number.isNaN(parsedWeight) || parsedWeight <= 0) {
    return failCommand("岗位投入权重必须大于 0", 400, "allocationWeight");
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
    allocationWeight,
  });
}

function withAllocationWeight(
  source: LifecycleAssignmentPeriod,
  value: unknown,
  effectiveDate: string,
): DomainValidationResult<LifecycleAssignmentPeriod> {
  const allocationWeight = text(value);
  const parsedWeight = parseAllocationWeight(allocationWeight);
  if (!allocationWeight || parsedWeight === null || Number.isNaN(parsedWeight) || parsedWeight <= 0) {
    return failCommand("岗位投入权重必须大于 0", 400, "allocationWeight");
  }
  if (allocationWeight === source.allocationWeight) {
    return failCommand("岗位投入权重未发生变化", 400, "allocationWeight");
  }
  return okCommand({ ...source, id: null, version: 0, startDate: effectiveDate, allocationWeight });
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
  const affectedPolicies = eventType === "onboard"
    ? [HR_EMPLOYMENT_TEMPORAL.policy, HR_ASSIGNMENT_TEMPORAL.policy]
    : eventType === "offboard"
      ? [HR_EMPLOYMENT_TEMPORAL.policy]
      : [HR_ASSIGNMENT_TEMPORAL.policy];
  if (
    effectiveDate < workspaceBusinessDate(new Date())
    && affectedPolicies.some((policy) => businessTemporalRetrospectiveChanges(policy) === "forbid")
  ) {
    return failCommand("该类周期不允许补录历史生效日期", 409, "effectiveDate");
  }
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
          allocationWeight: true,
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
  const sourceRequired = ["transfer", "allocation_change", "primary_change", "reporting_change"].includes(eventType);
  if (sourceRequired) {
    if (!source || !source.positionId || !source.allocationWeight) return failCommand("请选择生效日覆盖中的来源岗位", 400, "sourceAssignmentId");
    if (!assignmentPeriodContainsDate(source, effectiveDate)) return failCommand("来源岗位在生效日不处于有效期间");
    if (source.startDate && source.startDate >= effectiveDate) return failCommand("生效日必须晚于来源岗位开始日期");
  }
  const sourceAssignment: LifecycleAssignmentPeriod | null = source?.positionId && source.allocationWeight
    ? { ...source, positionId: source.positionId, allocationWeight: source.allocationWeight }
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
    if (
      !onboardingPlaceholder
      && !employeeCanOnboardAt({
        employments: employee.employments,
        assignmentCount: employee.positions.length,
        lifecycleEventCount: employee.lifecycleEvents.length,
        effectiveDate,
      })
    ) {
      return failCommand("该员工已有未结束或未来雇佣记录，不能重复登记入职", 409, "eventType");
    }
  } else if (!activeEmployment) {
    return failCommand("该员工在生效日没有有效雇佣期间");
  } else if (activeEmployments.length > 1) {
    return failCommand("该员工在生效日存在多条有效雇佣期间，请先修正资料");
  }

  let targetAssignment: LifecycleAssignmentPeriod | null = null;
  let previousPrimaryAssignment: LifecycleAssignmentPeriod | null = null;
  let previousPrimaryTarget: LifecycleAssignmentPeriod | null = null;
  let restoredPrimaryAssignment: LifecycleAssignmentPeriod | null = null;
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
    if (assignmentEndDate && activeEmployment?.leaveDate && assignmentEndDate > activeEmployment.leaveDate) {
      return failCommand("兼岗结束日期不能晚于雇佣结束日期", 400, "assignmentEndDate");
    }
    targetAssignment = { ...target.data, isPrimary: false, endDate: assignmentEndDate };
  } else if (eventType === "allocation_change") {
    const target = withAllocationWeight(sourceAssignment!, input.allocationWeight, effectiveDate);
    if (!target.ok) return target;
    targetAssignment = target.data;
  } else if (eventType === "primary_change") {
    if (sourceAssignment!.isPrimary) return failCommand("所选岗位已经是主岗", 400, "sourceAssignmentId");
    const activeAssignments = employee.positions.filter((row) => assignmentPeriodContainsDate(row, effectiveDate));
    const currentPrimary = activeAssignments.find((row) => row.isPrimary && row.positionId && row.allocationWeight) ?? null;
    if (!currentPrimary?.positionId || !currentPrimary.allocationWeight) return failCommand("生效日没有可切换的当前主岗", 409);
    if (currentPrimary.startDate && currentPrimary.startDate >= effectiveDate) {
      return failCommand("主岗变更生效日必须晚于当前主岗开始日期", 400, "effectiveDate");
    }
    previousPrimaryAssignment = { ...currentPrimary, positionId: currentPrimary.positionId, allocationWeight: currentPrimary.allocationWeight };
    targetAssignment = { ...sourceAssignment!, id: null, version: 0, startDate: effectiveDate, isPrimary: true };
    const temporaryEnd = sourceAssignment!.endDate && (!currentPrimary.endDate || sourceAssignment!.endDate < currentPrimary.endDate)
      ? sourceAssignment!.endDate
      : currentPrimary.endDate;
    previousPrimaryTarget = {
      ...previousPrimaryAssignment,
      id: null,
      version: 0,
      startDate: effectiveDate,
      endDate: temporaryEnd,
      isPrimary: false,
    };
    if (sourceAssignment!.endDate && (!currentPrimary.endDate || sourceAssignment!.endDate < currentPrimary.endDate)) {
      restoredPrimaryAssignment = {
        ...previousPrimaryAssignment,
        id: null,
        version: 0,
        startDate: shiftBusinessDate(sourceAssignment!.endDate, 1),
      };
    }
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
    previousPrimaryAssignment,
    previousPrimaryTarget,
    restoredPrimaryAssignment,
    assignmentEndDate,
    employment: eventType === "onboard" ? onboardingPlaceholder : activeEmployment,
    employmentFields: employmentFields.data,
  });
}
