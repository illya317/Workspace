import { validateFkValue } from "@workspace/platform/server/fk-registry";
import { isValidDateValue, rejectInvalidDateField } from "@workspace/platform/server/api";
import { prisma } from "@workspace/platform/server/prisma";
import { WORK_FK_REGISTRY } from "./fk-registry";
import { guardProjectArchive } from "./reference-guards";

const DATE_FIELDS = ["startDate", "endDate"];
const NUMBER_FIELDS = ["budgetAmount"];
const NUMBER_OR_NULL_FIELDS = ["parentId"];

export const PROJECT_STATUSES = ["规划中", "进行中", "暂停", "已完成", "已取消"];
export const PROJECT_PRIORITIES = ["高", "中", "低"];
export const PROJECT_STAGES = ["立项", "规划", "执行", "验收", "收尾"];

type ParentIdResult = { value: number | null } | { error: string };
type LeadingDepartmentResult =
  | { value: number; department: { id: number; code: string; name: string } }
  | { error: string };
type ProjectFieldUpdateResult = { field: string; value: unknown } | { error: string } | null;

export const PROJECT_CONFIG = {
  entityType: "Project",
  modelKey: "project" as const,
  allowedFields: [
    "name",
    "description",
    "status",
    "priority",
    "stage",
    "plan",
    "goal",
    "milestones",
    "budgetAmount",
    "budgetNote",
    "riskNote",
    "remark",
    "startDate",
    "endDate",
    "parentId",
    "leadingDepartmentId",
    "isArchived",
    "archivedAt",
  ],
  onBeforeUpdate: normalizeProjectFieldUpdate,
  onBeforeDelete: async (id: number) => {
    const blockMessage = await guardProjectArchive(id, "删除项目");
    return blockMessage ? { error: blockMessage, status: 409 } : { ok: true as const };
  },
};

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export function parseDate(value: string | null | undefined) {
  return value ? new Date(`${value}T00:00:00`) : null;
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

function normalizeNullablePositiveInt(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number <= 0) return Number.NaN;
  return number;
}

export async function normalizeProjectParentId(value: unknown, currentProjectId?: number): Promise<ParentIdResult> {
  const parentId = normalizeNullablePositiveInt(value);
  if (Number.isNaN(parentId)) return { error: "上级项目无效" };
  if (!parentId) return { value: null };
  if (currentProjectId && parentId === currentProjectId) return { error: "上级项目不能选择自己" };
  const validation = await validateFkValue(WORK_FK_REGISTRY, {
    fkKey: "work.project.parent",
    value: parentId,
    requiredLabel: "上级项目",
  });
  if (!validation.ok) return { error: validation.error };

  let cursor: number | null = parentId;
  while (cursor) {
    const parent: { id: number; parentId: number | null } | null = await prisma.project.findUnique({
      where: { id: cursor },
      select: { id: true, parentId: true },
    });
    if (!parent) return { error: "上级项目不存在" };
    if (currentProjectId && parent.parentId === currentProjectId) return { error: "不能形成项目层级循环" };
    cursor = parent.parentId;
  }

  return { value: parentId };
}

export async function normalizeLeadingDepartmentId(value: unknown): Promise<LeadingDepartmentResult> {
  const leadingDepartmentId = normalizeNullablePositiveInt(value);
  if (Number.isNaN(leadingDepartmentId) || !leadingDepartmentId) return { error: "主导部门不能为空" };
  const validation = await validateFkValue(WORK_FK_REGISTRY, {
    fkKey: "work.project.leadingDepartment",
    value: leadingDepartmentId,
    requiredLabel: "主导部门",
  });
  if (!validation.ok) return { error: validation.error };
  const department = await prisma.department.findUnique({
    where: { id: leadingDepartmentId },
    select: { id: true, code: true, name: true },
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
  return `${prefix}-${String(maxSequence + 1).padStart(2, "0")}`;
}

async function normalizeProjectFieldUpdate(field: string, value: unknown, id?: number): Promise<ProjectFieldUpdateResult> {
  const dateResult = rejectInvalidDateField(field, value, DATE_FIELDS);
  if (!dateResult) return null;
  if (DATE_FIELDS.includes(field)) return { field, value: value ? new Date(`${value}T00:00:00`) : null };
  if (NUMBER_FIELDS.includes(field)) {
    const number = normalizeBudgetAmount(value);
    if (Number.isNaN(number)) return null;
    return { field, value: number };
  }
  if (NUMBER_OR_NULL_FIELDS.includes(field)) {
    const result = await normalizeProjectParentId(value, id);
    if ("error" in result) return { error: result.error };
    return { field, value: result.value };
  }
  if (field === "leadingDepartmentId") {
    const result = await normalizeLeadingDepartmentId(value);
    if ("error" in result) return { error: result.error };
    return { field, value: result.value };
  }
  if (field === "isArchived") return { field, value: Boolean(value) };
  if (field === "status" && !isAllowedProjectOption(value, PROJECT_STATUSES)) return null;
  if (field === "priority" && !isAllowedProjectOption(value, PROJECT_PRIORITIES)) return null;
  if (field === "stage" && !isAllowedProjectOption(value, PROJECT_STAGES)) return null;
  if (field !== "name" && typeof value === "string" && value.trim() === "") return { field, value: null };
  return { field, value };
}

export function hasValidProjectDates(startDate?: string | null, endDate?: string | null) {
  return isValidDateValue(startDate) && isValidDateValue(endDate);
}
