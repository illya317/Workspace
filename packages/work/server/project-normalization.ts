import { isValidDateValue, rejectInvalidDateField } from "@workspace/platform/server/api";
import { validateFkValue } from "@workspace/platform/server/fk-registry";
import { prisma } from "@workspace/platform/server/prisma";
import { WORK_FK_REGISTRY } from "./fk-registry";

const DATE_FIELDS = ["startDate", "endDate"];
const NUMBER_FIELDS = ["budgetAmount", "completionPercent"];

export const PROJECT_LEVELS = ["普通", "重点", "特殊"];

type LeadingDepartmentResult =
  | { value: number; department: { id: number; code: string; name: string; managerUserId: number | null } }
  | { error: string };
type ProjectFieldUpdateResult = { field: string; value: unknown } | { error: string } | null;

export const PROJECT_CONFIG = {
  entityType: "Project",
  modelKey: "project" as const,
  allowedFields: [
    "name",
    "description",
    "projectLevel",
    "plan",
    "goal",
    "milestones",
    "budgetAmount",
    "budgetNote",
    "riskNote",
    "remark",
    "startDate",
    "endDate",
    "completionPercent",
    "leadingDepartmentId",
    "isArchived",
    "archivedAt",
  ],
  onBeforeUpdate: normalizeProjectFieldUpdate,
};

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export function parseDate(value: string | null | undefined) {
  return value ? new Date(`${value}T00:00:00`) : null;
}

export function todayDateString() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function isFutureDateValue(value: unknown) {
  return typeof value === "string" && isValidDateValue(value) && value > todayDateString();
}

export function nullableString(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

export function isAllowedProjectOption(value: unknown, options: readonly string[]) {
  return value === null || value === undefined || value === "" || (typeof value === "string" && options.includes(value));
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
  if (Number.isNaN(leadingDepartmentId) || !leadingDepartmentId) return { error: "主导部门不能为空" };
  const validation = await validateFkValue(WORK_FK_REGISTRY, {
    fkKey: "work.projects.leadingDepartment",
    value: leadingDepartmentId,
    requiredLabel: "主导部门",
  });
  if (!validation.ok) return { error: validation.error };
  const department = await prisma.department.findUnique({
    where: { id: leadingDepartmentId },
    select: { id: true, code: true, name: true, managerUserId: true },
  });
  if (!department) return { error: "主导部门不存在" };
  return { value: leadingDepartmentId, department };
}

function planCodePrefix(departmentCode: string, dateValue?: Date | string | null) {
  const date = dateValue ? new Date(dateValue) : new Date();
  const year = Number.isNaN(date.getTime()) ? new Date().getFullYear() : date.getFullYear();
  return `${departmentCode.trim()}-${String(year % 100).padStart(2, "0")}`;
}

export async function generateProjectCode(departmentCode: string, dateValue?: Date | string | null) {
  const prefix = planCodePrefix(departmentCode, dateValue);
  const existing = await prisma.project.findMany({
    where: { code: { startsWith: `${prefix}-` } },
    select: { code: true },
  });
  let maxSequence = 0;
  for (const project of existing) {
    const match = project.code?.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`));
    if (!match) continue;
    maxSequence = Math.max(maxSequence, Number(match[1]));
  }
  return `${prefix}-${String(maxSequence + 1).padStart(3, "0")}`;
}

async function normalizeProjectFieldUpdate(field: string, value: unknown, id?: number): Promise<ProjectFieldUpdateResult> {
  const dateResult = rejectInvalidDateField(field, value, DATE_FIELDS);
  if (!dateResult) return null;
  if (field === "endDate" && isFutureDateValue(value)) return { error: "结项日期不能晚于今日" };
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
  if (field === "isArchived") return { field, value: Boolean(value) };
  if (field === "projectLevel" && !isAllowedProjectOption(value, PROJECT_LEVELS)) return null;
  if (field !== "name" && typeof value === "string" && value.trim() === "") return { field, value: null };
  return { field, value };
}

export function hasValidProjectDates(startDate?: string | null, endDate?: string | null) {
  return isValidDateValue(startDate) && isValidDateValue(endDate);
}
