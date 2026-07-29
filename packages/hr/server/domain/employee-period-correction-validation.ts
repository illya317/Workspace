import {
  businessDateWindowsOverlap,
  businessTemporalRetrospectiveChanges,
  inclusiveBusinessPeriodToWindow,
  parseBusinessDate,
} from "@workspace/platform/contracts/business-temporal";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import type { Prisma } from "@workspace/platform/server/prisma";
import { parseAllocationWeight, validateEmploymentOption } from "../field-validation";
import { validateEmploymentPersonnelTypeTransition } from "./employment-validation";
import { HR_ASSIGNMENT_TEMPORAL, HR_EMPLOYMENT_TEMPORAL } from "../../business-temporal";
import { validateAssignmentTimeline } from "./employee-lifecycle-validation";
import { isFunctionalPosition } from "./position-report-override-validation";

const EMPLOYMENT_PATCH_FIELDS = [
  "joinDate",
  "leaveDate",
  "leaveReason",
  "leaveNote",
  "officeLocation",
  "personnelType",
  "rank",
  "title",
] as const;
const ASSIGNMENT_PATCH_FIELDS = [
  "reportingCompanyId",
  "departmentId",
  "positionId",
  "positionReportOverrideId",
  "isPrimary",
  "startDate",
  "endDate",
  "reportToPositionId",
  "allocationWeight",
] as const;

type EmploymentPatchField = typeof EMPLOYMENT_PATCH_FIELDS[number];
type AssignmentPatchField = typeof ASSIGNMENT_PATCH_FIELDS[number];
export type EmploymentPatch = Partial<Record<EmploymentPatchField, string | null>>;
type AssignmentPatch = Partial<Record<AssignmentPatchField, number | boolean | string | null>>;

export type EmployeePeriodCorrectionInput = {
  entityType?: unknown;
  expectedVersion?: unknown;
  patch?: unknown;
  reason?: unknown;
};

export type EmployeePeriodCorrectionCommand = {
  employeeId: number;
  periodId: number;
  userId: number;
  expectedVersion: number;
  reason: string | null;
} & (
  | { entityType: "Employment"; patch: EmploymentPatch }
  | { entityType: "EDP"; patch: AssignmentPatch }
);

type EmploymentState = {
  id: number;
  employeeId: number;
  version: number;
  joinDate: string | null;
  leaveDate: string | null;
  isActive: boolean;
  leaveReason: string | null;
  leaveNote: string | null;
  officeLocation: string | null;
  personnelType: string | null;
  rank: string | null;
  title: string | null;
};

export type AssignmentState = {
  id: number;
  employeeId: number;
  version: number;
  reportingCompanyId: number | null;
  departmentId: number | null;
  positionId: number | null;
  positionReportOverrideId: number | null;
  isPrimary: boolean;
  startDate: string | null;
  endDate: string | null;
  reportTo: string | null;
  reportToPositionId: number | null;
  allocationWeight: string | null;
};

export type EmployeePeriodCorrectionState =
  | { entityType: "Employment"; current: EmploymentState; next: EmploymentState }
  | { entityType: "EDP"; current: AssignmentState; next: AssignmentState };

export function buildEmployeePeriodCorrectionCommand(
  employeeId: number,
  periodId: number,
  input: EmployeePeriodCorrectionInput,
  userId: number,
): DomainValidationResult<EmployeePeriodCorrectionCommand> {
  if (!isPositiveInteger(employeeId)) return failCommand("员工ID无效", 400, "employeeId");
  if (!isPositiveInteger(periodId)) return failCommand("任职记录无效", 400, "periodId");
  if (!isPositiveInteger(userId)) return failCommand("操作人无效", 400, "userId");
  if (!isPositiveInteger(input.expectedVersion)) return failCommand("记录版本无效", 400, "expectedVersion");
  const reason = optionalText(input.reason);
  if (reason && reason.length > 1000) return failCommand("修正说明不能超过1000字", 400, "reason");
  if (input.entityType === "Employment") {
    const patch = normalizeEmploymentPatch(input.patch);
    if (!patch.ok) return patch;
    return okCommand({
      employeeId,
      periodId,
      userId,
      entityType: "Employment",
      expectedVersion: Number(input.expectedVersion),
      patch: patch.data,
      reason,
    });
  }
  if (input.entityType === "EDP") {
    const patch = normalizeAssignmentPatch(input.patch);
    if (!patch.ok) return patch;
    return okCommand({
      employeeId,
      periodId,
      userId,
      entityType: "EDP",
      expectedVersion: Number(input.expectedVersion),
      patch: patch.data,
      reason,
    });
  }
  return failCommand("任职记录类型无效", 400, "entityType");
}

export async function validateEmployeePeriodCorrectionState(
  tx: Prisma.TransactionClient,
  command: EmployeePeriodCorrectionCommand,
): Promise<DomainValidationResult<EmployeePeriodCorrectionState>> {
  const employee = await tx.employee.findUnique({ where: { id: command.employeeId }, select: { id: true } });
  if (!employee) return failCommand("员工不存在", 404);
  if (command.entityType === "Employment") return validateEmploymentState(tx, command);
  return validateAssignmentState(tx, command);
}

function normalizeEmploymentPatch(value: unknown): DomainValidationResult<EmploymentPatch> {
  const record = strictPatchRecord(value, EMPLOYMENT_PATCH_FIELDS);
  if (!record.ok) return record;
  const patch: EmploymentPatch = {};
  for (const field of EMPLOYMENT_PATCH_FIELDS) {
    if (!(field in record.data)) continue;
    if (field === "joinDate" || field === "leaveDate") {
      const date = nullableBusinessDate(record.data[field], field === "joinDate" ? "入职日期" : "离职日期");
      if (!date.ok) return date;
      patch[field] = date.data;
      continue;
    }
    const value = optionalText(record.data[field]);
    if (field !== "leaveNote" && !validateEmploymentOption(field, value)) {
      return failCommand("字段值不在允许范围内", 400, field);
    }
    patch[field] = value;
  }
  return okCommand(patch);
}

function normalizeAssignmentPatch(value: unknown): DomainValidationResult<AssignmentPatch> {
  const record = strictPatchRecord(value, ASSIGNMENT_PATCH_FIELDS);
  if (!record.ok) return record;
  const patch: AssignmentPatch = {};
  for (const field of ASSIGNMENT_PATCH_FIELDS) {
    if (!(field in record.data)) continue;
    const raw = record.data[field];
    if (field === "isPrimary") {
      if (typeof raw !== "boolean") return failCommand("主岗值无效", 400, field);
      patch[field] = raw;
    } else if (field === "startDate" || field === "endDate") {
      const date = nullableBusinessDate(raw, field === "startDate" ? "开始日期" : "结束日期");
      if (!date.ok) return date;
      patch[field] = date.data;
    } else if (field === "allocationWeight") {
      const weight = optionalText(raw);
      const parsed = parseAllocationWeight(weight);
      if (!weight || parsed === null || Number.isNaN(parsed) || parsed <= 0) {
        return failCommand("岗位投入权重必须大于0", 400, field);
      }
      patch[field] = weight;
    } else {
      const id = nullablePositiveInteger(raw);
      if (Number.isNaN(id)) return failCommand("关联记录无效", 400, field);
      patch[field] = id;
    }
  }
  return okCommand(patch);
}

async function validateEmploymentState(
  tx: Prisma.TransactionClient,
  command: Extract<EmployeePeriodCorrectionCommand, { entityType: "Employment" }>,
): Promise<DomainValidationResult<EmployeePeriodCorrectionState>> {
  if (HR_EMPLOYMENT_TEMPORAL.policy.revision === "forbid") return failCommand("该雇佣期间不允许修正", 409);
  const [current, employments, assignments] = await Promise.all([
    tx.employment.findFirst({
      where: { id: command.periodId, employeeId: command.employeeId },
      select: employmentStateSelect,
    }),
    tx.employment.findMany({
      where: { employeeId: command.employeeId },
      select: employmentStateSelect,
    }),
    tx.eDP.findMany({
      where: { employeeId: command.employeeId },
      select: { startDate: true, endDate: true },
    }),
  ]);
  if (!current) return failCommand("雇佣期间不存在", 404);
  if (current.version !== command.expectedVersion) return failCommand("雇佣期间已被修改，请刷新后重试", 409);
  const next = { ...current, ...command.patch };
  if ("personnelType" in command.patch) {
    const transition = validateEmploymentPersonnelTypeTransition(current.personnelType, next.personnelType);
    if (!transition.ok) return transition;
  }
  if (!next.joinDate) return failCommand("入职日期必填", 400, "joinDate");
  if (next.leaveDate && next.joinDate > next.leaveDate) return failCommand("入职日期不能晚于离职日期", 409, "leaveDate");
  if (
    businessTemporalRetrospectiveChanges(HR_EMPLOYMENT_TEMPORAL.policy) === "forbid"
    && next.joinDate < workspaceBusinessDate(new Date())
  ) return failCommand("该雇佣期间不允许修正历史日期", 409, "joinDate");
  const proposed = employments.map((row) => row.id === current.id ? next : row);
  if (HR_EMPLOYMENT_TEMPORAL.policy.overlaps === "forbid" && hasEmploymentOverlap(proposed)) {
    return failCommand("雇佣期间不能与其他雇佣期间重叠", 409);
  }
  if (assignments.some((assignment) => !proposed.some((employment) => periodContains(
    { startDate: employment.joinDate, endDate: employment.leaveDate },
    assignment,
  )))) return failCommand("修正后会有任职期间落在雇佣期间之外，请先调整对应任职记录", 409);
  return okCommand({ entityType: "Employment", current, next });
}

async function validateAssignmentState(
  tx: Prisma.TransactionClient,
  command: Extract<EmployeePeriodCorrectionCommand, { entityType: "EDP" }>,
): Promise<DomainValidationResult<EmployeePeriodCorrectionState>> {
  if (HR_ASSIGNMENT_TEMPORAL.policy.revision === "forbid") return failCommand("该任职期间不允许修正", 409);
  const [current, assignments, employments] = await Promise.all([
    tx.eDP.findFirst({
      where: { id: command.periodId, employeeId: command.employeeId },
      select: assignmentStateSelect,
    }),
    tx.eDP.findMany({ where: { employeeId: command.employeeId }, select: assignmentStateSelect }),
    tx.employment.findMany({
      where: { employeeId: command.employeeId },
      select: { joinDate: true, leaveDate: true },
    }),
  ]);
  if (!current) return failCommand("任职期间不存在", 404);
  if (current.version !== command.expectedVersion) return failCommand("任职期间已被修改，请刷新后重试", 409);
  const next = { ...current, ...command.patch };
  if (!next.startDate) return failCommand("任职开始日期必填", 400, "startDate");
  if (next.endDate && next.startDate > next.endDate) return failCommand("任职开始日期不能晚于结束日期", 409, "endDate");
  if (!next.reportingCompanyId || !next.departmentId || !next.positionId) {
    return failCommand("汇报公司、部门和岗位必须完整填写", 400);
  }
  const placement = await validateAssignmentPlacement(tx, next);
  if (!placement.ok) return placement;
  if (!employments.some((employment) => periodContains(
    { startDate: employment.joinDate, endDate: employment.leaveDate },
    next,
  ))) return failCommand("任职期间必须完整落在某一雇佣期间内", 409);
  const proposed = assignments.map((row) => row.id === current.id ? next : row);
  const timelineError = validateAssignmentCorrectionTimeline(proposed, current, next);
  if (timelineError) return failCommand(timelineError, 409);
  return okCommand({ entityType: "EDP", current, next });
}

export function validateAssignmentCorrectionTimeline(
  proposed: AssignmentState[],
  current: AssignmentState,
  next: AssignmentState,
) {
  if (!next.startDate) return "任职开始日期必填";
  const affectedFrom = current.startDate && current.startDate < next.startDate
    ? current.startDate
    : next.startDate;
  return validateAssignmentTimeline(proposed, affectedFrom);
}

export async function validateAssignmentPlacement(tx: Prisma.TransactionClient, row: AssignmentState) {
  const [company, department, position] = await Promise.all([
    tx.company.findUnique({ where: { id: row.reportingCompanyId! }, select: { id: true, isActive: true } }),
    tx.department.findUnique({ where: { id: row.departmentId! }, select: { id: true, isArchived: true } }),
    tx.position.findUnique({
      where: { id: row.positionId! },
      select: {
        id: true,
        departmentId: true,
        isArchived: true,
        department: { select: { code: true, hierarchyKind: true, isArchived: true } },
      },
    }),
  ]);
  if (!company) return failCommand("汇报公司不存在", 404, "reportingCompanyId");
  if (!company.isActive) return failCommand("停用公司不能作为汇报公司", 409, "reportingCompanyId");
  if (!department) return failCommand("任职部门不存在", 404, "departmentId");
  if (department.isArchived) return failCommand("归档部门不能用于任职", 409, "departmentId");
  if (!position) return failCommand("任职岗位不存在", 404, "positionId");
  if (position.isArchived) return failCommand("归档岗位不能用于任职", 409, "positionId");
  const functional = isFunctionalPosition(position);
  const override = row.positionReportOverrideId
    ? await tx.positionReportOverride.findFirst({
        where: {
          id: row.positionReportOverrideId,
          positionId: row.positionId!,
          companyId: row.reportingCompanyId!,
          departmentId: row.departmentId!,
          isActive: true,
        },
        select: { id: true },
      })
    : null;
  if (row.positionReportOverrideId && !override) return failCommand("特殊汇报配置无效", 409, "positionReportOverrideId");
  if (!override && position.departmentId !== row.departmentId) {
    return failCommand(functional ? "该职能岗位未对所选公司和部门启用" : "普通岗位只能选择其所属部门", 409, "departmentId");
  }
  const parsedWeight = parseAllocationWeight(row.allocationWeight);
  if (!row.allocationWeight || parsedWeight === null || Number.isNaN(parsedWeight) || parsedWeight <= 0) {
    return failCommand("岗位投入权重必须大于0", 400, "allocationWeight");
  }
  if (!row.reportToPositionId) return okCommand(true);
  if (row.reportToPositionId === row.positionId) return failCommand("汇报岗位不能是岗位自身", 409, "reportToPositionId");
  const [reportTo, departments] = await Promise.all([
    tx.position.findUnique({ where: { id: row.reportToPositionId }, select: { id: true, departmentId: true, isArchived: true } }),
    tx.department.findMany({ select: { id: true, parentId: true } }),
  ]);
  if (!reportTo) return failCommand("汇报岗位不存在", 404, "reportToPositionId");
  if (reportTo.isArchived) return failCommand("归档岗位不能作为汇报岗位", 409, "reportToPositionId");
  const ancestorIds = organizationAncestorIds(row.departmentId, departments);
  if (!reportTo.departmentId || !ancestorIds.includes(reportTo.departmentId)) {
    return failCommand("汇报岗位必须来源于任职组织或其上级组织", 409, "reportToPositionId");
  }
  return okCommand(true);
}

const assignmentStateSelect = {
  id: true,
  employeeId: true,
  version: true,
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
} as const;

const employmentStateSelect = {
  id: true,
  employeeId: true,
  version: true,
  joinDate: true,
  leaveDate: true,
  isActive: true,
  leaveReason: true,
  leaveNote: true,
  officeLocation: true,
  personnelType: true,
  rank: true,
  title: true,
} as const;

export function employeePeriodCorrectionHasChanges(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
) {
  return Object.entries(patch).some(([field, value]) => current[field] !== value);
}

function strictPatchRecord<const TField extends string>(value: unknown, fields: readonly TField[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return failCommand<Record<TField, unknown>>("修正内容无效", 400, "patch");
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 0) return failCommand<Record<TField, unknown>>("没有需要保存的修改", 400, "patch");
  const allowed = new Set<string>(fields);
  const unsupported = keys.find((key) => !allowed.has(key));
  if (unsupported) return failCommand<Record<TField, unknown>>(`字段 ${unsupported} 不支持在此处修正`, 400, unsupported);
  return okCommand(record as Record<TField, unknown>);
}

function nullableBusinessDate(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return okCommand<string | null>(null);
  const parsed = parseBusinessDate(value);
  return parsed ? okCommand<string | null>(parsed) : failCommand<string | null>(`${label}无效`, 400);
}

function optionalText(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function isPositiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0;
}

function nullablePositiveInteger(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : Number.NaN;
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

function organizationAncestorIds(departmentId: number, departments: Array<{ id: number; parentId: number | null }>) {
  const byId = new Map(departments.map((department) => [department.id, department]));
  const result: number[] = [];
  const seen = new Set<number>();
  let currentId: number | null = departmentId;
  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    result.push(currentId);
    currentId = byId.get(currentId)?.parentId ?? null;
  }
  return result;
}
