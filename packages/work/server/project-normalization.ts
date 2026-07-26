import { isValidDateValue, rejectInvalidDateField } from "@workspace/platform/server/api";
import { getOperatingCommitteeDepartmentContext } from "@workspace/platform/server/business-space-permissions";
import { validateFkValue } from "@workspace/platform/server/relation-registry";
import { prisma } from "@workspace/platform/server/prisma";
import { isActualDateAfterToday } from "@workspace/platform/completion-date-policy";
import { WORK_FK_REGISTRY } from "./fk-registry";
import { getTenantProfile } from "@workspace/platform/server/tenant-config";

const DATE_FIELDS = ["plannedStartDate", "plannedEndDate", "actualStartDate", "actualEndDate"];
const NUMBER_FIELDS = ["budgetAmount", "completionPercent"];

export const PROJECT_LEVELS = ["普通", "重点", "特殊"];
export const PROJECT_TYPES = ["company", "department", "other"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];
type LeadingDepartmentResult =
  | { value: number; department: { id: number; code: string; name: string } }
  | { error: string };
type NullableDepartmentResult =
  | { value: number | null; department: { id: number; code: string; name: string } | null }
  | { error: string };
type EnablingDepartmentsResult =
  | { value: number[]; departments: Array<{ id: number; code: string; name: string }> }
  | { error: string };
type ProjectFieldUpdateResult = { field: string; value: unknown } | { error: string } | null;

export const PROJECT_CONFIG = {
  entityType: "Project",
  modelKey: "project" as const,
  allowedFields: [
    "name",
    "description",
    "projectType",
    "projectLevel",
    "plan",
    "goal",
    "milestones",
    "budgetAmount",
    "budgetNote",
    "riskNote",
    "remark",
    "plannedStartDate",
    "plannedEndDate",
    "actualStartDate",
    "actualEndDate",
    "status",
    "completionPercent",
    "leadingDepartmentId",
    "enablingDepartmentIds",
    "workspaceEnabled",
    "isArchived",
    "archivedAt",
  ],
  onBeforeUpdate: normalizeProjectFieldUpdate,
};

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  return String(value).slice(0, 10);
}

export function parseDate(value: string | null | undefined) {
  return value ? new Date(`${value}T00:00:00`) : null;
}

export function isFutureDateValue(value: unknown) {
  return typeof value === "string" && isValidDateValue(value) && isActualDateAfterToday(value);
}

export function nullableString(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

export function isAllowedProjectOption(value: unknown, options: readonly string[]) {
  return value === null || value === undefined || value === "" || (typeof value === "string" && options.includes(value));
}

export function normalizeProjectType(value: unknown): ProjectType {
  return PROJECT_TYPES.includes(value as ProjectType) ? value as ProjectType : "department";
}

function normalizeBudgetAmount(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : Number.NaN;
}

function normalizeCompletionPercent(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) && number >= 0 ? number : Number.NaN;
}

function normalizeNullablePositiveInt(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number <= 0) return Number.NaN;
  return number;
}

export async function normalizeLeadingDepartmentId(value: unknown): Promise<LeadingDepartmentResult> {
  const leadingDepartmentId = normalizeNullablePositiveInt(value);
  if (Number.isNaN(leadingDepartmentId) || !leadingDepartmentId) return { error: "归口部门不能为空" };
  const validation = await validateFkValue(WORK_FK_REGISTRY, {
    fkKey: "work.projects.leadingDepartment",
    value: leadingDepartmentId,
    requiredLabel: "归口部门",
  });
  if (!validation.ok) return { error: validation.error };
  const department = await prisma.department.findUnique({
    where: { id: leadingDepartmentId },
    select: { id: true, code: true, name: true },
  });
  if (!department) return { error: "归口部门不存在" };
  return { value: leadingDepartmentId, department };
}

export async function normalizeEnablingDepartmentIds(value: unknown): Promise<EnablingDepartmentsResult> {
  const rawValues = Array.isArray(value) ? value : value === null || value === undefined || value === "" ? [] : [value];
  const ids = Array.from(new Set(rawValues.map(normalizeNullablePositiveInt)));
  if (ids.length === 0 || ids.some((id) => id === null || Number.isNaN(id))) return { error: "赋能部门不能为空" };
  const departments: Array<{ id: number; code: string; name: string }> = [];
  for (const id of ids) {
    const validation = await validateFkValue(WORK_FK_REGISTRY, {
      fkKey: "work.projects.enablingDepartment",
      value: id,
      requiredLabel: "赋能部门",
    });
    if (!validation.ok) return { error: validation.error };
    const department = await prisma.department.findUnique({
      where: { id: id as number },
      select: { id: true, code: true, name: true },
    });
    if (!department) return { error: "赋能部门不存在" };
    departments.push(department);
  }
  return { value: ids as number[], departments };
}

export async function normalizeLeadingDepartmentForProjectType(
  projectType: ProjectType,
  value: unknown,
): Promise<NullableDepartmentResult> {
  if (projectType === "company") {
    const committeeName = getTenantProfile().organization.operatingCommittee.departmentName;
    const requestedId = normalizeNullablePositiveInt(value);
    if (Number.isNaN(requestedId)) return { error: "归口部门无效" };
    const committee = await getOperatingCommitteeDepartmentContext();
    if (!committee) return { error: `缺少${committeeName}，无法设置公司项目归口部门` };
    if (requestedId !== null && requestedId !== committee.id) {
      return { error: `公司项目归口部门只能是${committeeName}` };
    }
    return {
      value: committee.id,
      department: { id: committee.id, code: committee.code, name: committee.name },
    };
  }

  const requestedId = normalizeNullablePositiveInt(value);
  if (requestedId === null) {
    return projectType === "department"
      ? { error: "部门项目必须选择归口部门" }
      : { value: null, department: null };
  }
  if (Number.isNaN(requestedId)) return { error: "归口部门无效" };
  return normalizeLeadingDepartmentId(requestedId);
}

function planCodePrefix(prefixCode: string, dateValue?: Date | string | null) {
  const date = dateValue ? new Date(dateValue) : new Date();
  const year = Number.isNaN(date.getTime()) ? new Date().getFullYear() : date.getFullYear();
  return `${prefixCode.trim()}-${String(year % 100).padStart(2, "0")}`;
}

export async function generateProjectCode(input: { projectType: ProjectType; departmentCode?: string | null; dateValue?: Date | string | null }) {
  const numbering = getTenantProfile().work;
  const prefixCode = input.projectType === "department" ? input.departmentCode : numbering.companyProjectCodePrefix;
  if (!prefixCode) return null;
  const prefix = planCodePrefix(prefixCode, input.dateValue);
  const sequenceStart = input.projectType === "other" ? numbering.otherProjectSequenceStart : numbering.companyProjectSequenceStart;
  const sequenceEnd = input.projectType === "company" ? numbering.companyProjectSequenceEnd : Number.POSITIVE_INFINITY;
  const sequenceWidth = input.projectType === "department"
    ? numbering.departmentProjectSequenceWidth
    : numbering.companyProjectSequenceWidth;
  const existing = await prisma.project.findMany({
    where: { code: { startsWith: `${prefix}-` } },
    select: { code: true },
  });
  let maxSequence = 0;
  for (const project of existing) {
    const match = project.code?.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`));
    if (!match) continue;
    const sequence = Number(match[1]);
    if (sequence < sequenceStart || sequence > sequenceEnd) continue;
    maxSequence = Math.max(maxSequence, sequence);
  }
  const nextSequence = Math.max(maxSequence + 1, sequenceStart);
  if (nextSequence > sequenceEnd) throw new Error("公司项目年度编号已用完");
  return `${prefix}-${String(nextSequence).padStart(sequenceWidth, "0")}`;
}

async function normalizeProjectFieldUpdate(field: string, value: unknown, id?: number): Promise<ProjectFieldUpdateResult> {
  const dateResult = rejectInvalidDateField(field, value, DATE_FIELDS);
  if (!dateResult) return null;
  if (field === "actualStartDate" && isFutureDateValue(value)) return { error: "实际开始不能晚于今日" };
  if (field === "actualEndDate" && isFutureDateValue(value)) return { error: "结项日期不能晚于今日" };
  if (DATE_FIELDS.includes(field)) return { field, value: value ? new Date(`${value}T00:00:00`) : null };
  if (NUMBER_FIELDS.includes(field)) {
    const number = field === "completionPercent" ? normalizeCompletionPercent(value) : normalizeBudgetAmount(value);
    if (Number.isNaN(number)) return null;
    return { field, value: number };
  }
  void id;
  if (field === "leadingDepartmentId") {
    const result = await normalizeLeadingDepartmentId(value);
    if ("error" in result) return { error: result.error };
    return { field, value: result.value };
  }
  if (field === "enablingDepartmentIds") {
    const result = await normalizeEnablingDepartmentIds(value);
    if ("error" in result) return { error: result.error };
    return { field, value: result.value };
  }
  if (field === "workspaceEnabled") return { field, value: Boolean(value) };
  if (field === "isArchived") return { field, value: Boolean(value) };
  if (field === "status") {
    return value === "pending" || value === "active" || value === "done" ? { field, value } : { error: "项目状态无效" };
  }
  if (field === "projectType") return { error: "项目类型创建后不可修改" };
  if (field === "projectLevel" && !isAllowedProjectOption(value, PROJECT_LEVELS)) return null;
  if (field !== "name" && typeof value === "string" && value.trim() === "") return { field, value: null };
  return { field, value };
}

export function hasValidProjectDates(actualStartDate?: string | null, actualEndDate?: string | null) {
  return isValidDateValue(actualStartDate) && isValidDateValue(actualEndDate);
}
