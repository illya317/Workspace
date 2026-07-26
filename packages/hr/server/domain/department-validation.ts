import { Prisma } from "@workspace/platform/server/prisma";
import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import { currentEmploymentDateWhere, currentOpenEndedDateWhere, validateFkValue } from "@workspace/platform/server/relation-registry";
import { prisma } from "@workspace/platform/server/prisma";
import { HR_FK_REGISTRY } from "../fk-registry";
import { getManagerPositionScopeDepartmentIds } from "../department-manager-positions";
import { guardDepartmentArchive } from "../reference-guards";
import { getTenantProfile } from "@workspace/platform/server/tenant-config";

export const DEPARTMENT_ALLOWED_FIELDS = ["code", "name", "alias", "hierarchyKind", "level", "levelLabel", "levelCode", "parentId", "managerPositionId", "managerEmployeeIds", "isArchived", "archivedAt"];

type DepartmentHierarchyKind = "G" | "M";

export interface DepartmentCreateInput {
  code?: unknown;
  name?: unknown;
  hierarchyKind?: unknown;
  level?: unknown;
  parentId?: unknown;
  managerPositionId?: unknown;
  managerEmployeeIds?: unknown;
  alias?: unknown;
  descriptions?: unknown;
}

export interface DepartmentUpdateInput {
  id?: unknown;
  code?: string;
  name?: string;
  alias?: string | null;
  hierarchyKind?: DepartmentHierarchyKind;
  level?: number;
  parentId?: number | string | null;
  managerPositionId?: number | string | null;
  managerEmployeeIds?: unknown;
  isArchived?: boolean;
  archivedAt?: Date | string | null;
  descriptions?: unknown;
}

export interface DepartmentUpdateCommand {
  id: number;
  data: Prisma.DepartmentUncheckedUpdateInput;
  managerEmployeeIds?: number[];
  descriptions: Array<{ id?: number; sourceFile: string; codeRaw?: string | null; details?: string | null }> | null;
}

export interface DepartmentCreateCommand {
  code: string;
  name: string;
  alias: string | null;
  hierarchyKind: DepartmentHierarchyKind;
  level: number;
  parentId: number | null;
  managerPositionId: number | null;
  managerEmployeeIds: number[];
  descriptions: DepartmentUpdateCommand["descriptions"];
}

function departmentPrefix(code: string) {
  const prefix = code.slice(0, 3);
  return /^[A-Z]{3}$/.test(prefix) ? prefix : "";
}

function departmentNumber(code: string) {
  const suffix = code.slice(3);
  return /^\d+$/.test(suffix) ? suffix : "";
}

function normalizeHierarchyKind(value: unknown): DepartmentHierarchyKind {
  return String(value || "M").trim().toUpperCase() === "G" ? "G" : "M";
}

async function findOperatingCommitteeId() {
  const committeeCode = getTenantProfile().organization.operatingCommittee.departmentCode;
  const committee = await prisma.department.findFirst({
    where: { code: committeeCode, hierarchyKind: "G", isArchived: false },
    select: { id: true },
  });
  return committee?.id ?? null;
}

async function resolveDepartmentParent(hierarchyKind: DepartmentHierarchyKind, level: number, code: string, parentId: number | null) {
  const levelCode = `${hierarchyKind}${level}`;
  if (hierarchyKind === "G" && !/^[A-Z]{3}$/.test(code)) return `${levelCode} 组织编码必须是 3 位大写字母`;
  if (level === 1) {
    if (hierarchyKind === "M" && !/^[A-Z]{3}001$/.test(code)) return "M1 组织编码必须是 3 位大写字母加 001";
    if (hierarchyKind === "M") {
      const committeeName = getTenantProfile().organization.operatingCommittee.departmentName;
      const operatingCommitteeId = await findOperatingCommitteeId();
      if (!operatingCommitteeId) return `缺少${committeeName}，无法维护 M1 组织`;
      if (parentId !== null && parentId !== operatingCommitteeId) return `M1 组织上级组织必须是${committeeName}`;
      return { parentId: operatingCommitteeId };
    }
    return { parentId: null };
  }
  if (!parentId || !Number.isInteger(parentId)) return `${levelCode} 组织必须选择上级组织`;
  const parent = await prisma.department.findUnique({ where: { id: parentId }, select: { code: true, hierarchyKind: true, level: true } });
  if (!parent) return "上级组织不存在";
  if (parent.hierarchyKind !== hierarchyKind) return `${levelCode} 组织只能挂在同一体系的上级组织下`;
  if (parent.level !== level - 1) return `${levelCode} 组织只能挂在 ${hierarchyKind}${level - 1} 组织下`;
  if (hierarchyKind === "G") return { parentId };
  const prefix = departmentPrefix(parent.code);
  if (!prefix || !code.startsWith(prefix)) return "组织编码必须继承上级组织前缀";
  const number = departmentNumber(code);
  if (!number) return `M${level} 编码必须是前缀后接纯数字`;
  if (level === 2 && !/^[1-9]\d*00$/.test(number)) return "M2 编码数字段必须为正整数并以 00 结尾";
  if (level === 3) {
    const parentNumber = departmentNumber(parent.code);
    if (!parentNumber.endsWith("00")) return "上级 M2 编码不合法";
    const tail = number.slice(-2);
    if (number.length !== parentNumber.length || number.slice(0, -2) !== parentNumber.slice(0, -2) || tail === "00") {
      return `M3 编码必须只替换 ${parentNumber} 的最后两位`;
    }
  }
  return { parentId };
}

async function validateNullableFk(fkKey: string, value: unknown, requiredLabel: string) {
  const validation = await validateFkValue(HR_FK_REGISTRY, { fkKey, value, requiredLabel });
  return validation.ok ? okCommand(validation.value) : failCommand(validation.error, validation.status);
}

async function validateManagerPosition(value: unknown, departmentId: number) {
  const managerPosition = await validateNullableFk("hr.department.manager.position", value, "负责人岗位");
  if (!managerPosition.ok || managerPosition.data === null) return managerPosition;
  const position = await prisma.position.findUnique({
    where: { id: managerPosition.data },
    select: { departmentId: true },
  });
  const scopeDepartmentIds = await getManagerPositionScopeDepartmentIds(departmentId);
  if (!position?.departmentId || !scopeDepartmentIds.includes(position.departmentId)) {
    return failCommand("负责人岗位必须属于当前组织及其上下级归属组织", 400);
  }
  return managerPosition;
}

function normalizeManagerEmployeeIds(value: unknown): DomainValidationResult<number[] | undefined> {
  if (value === undefined) return okCommand(undefined);
  if (value === null || value === "") return okCommand([]);
  const rawItems = Array.isArray(value) ? value : [value];
  const ids: number[] = [];
  for (const item of rawItems) {
    const id = Number(item);
    if (!Number.isInteger(id) || id <= 0) return failCommand("组织负责人无效", 400);
    if (!ids.includes(id)) ids.push(id);
  }
  return okCommand(ids);
}

async function validateManagerEmployees(value: unknown, managerPositionId: number | null) {
  const normalized = normalizeManagerEmployeeIds(value);
  if (!normalized.ok || normalized.data === undefined) return normalized;
  if (normalized.data.length === 0) return okCommand([]);
  if (!managerPositionId) return failCommand("请先选择负责人岗位", 400);
  const employees = await prisma.employee.findMany({
    where: {
      id: { in: normalized.data },
      employments: { some: currentEmploymentDateWhere() },
      positions: { some: currentOpenEndedDateWhere({ positionId: managerPositionId }) },
    },
    select: { id: true },
  });
  if (employees.length !== normalized.data.length) return failCommand("组织负责人必须来自负责人岗位的在岗员工", 400);
  return okCommand(normalized.data);
}

async function hasCyclicParent(id: number, parentId: number | null): Promise<boolean> {
  if (!parentId) return false;
  const visited = new Set<number>();
  let current: number | null = parentId;
  while (current !== null) {
    if (current === id) return true;
    if (visited.has(current)) return false;
    visited.add(current);
    const parent: { parentId: number | null } | null = await prisma.department.findUnique({ where: { id: current }, select: { parentId: true } });
    if (!parent) return false;
    current = parent.parentId;
  }
  return false;
}

function normalizeDescriptionList(descriptions: unknown): DomainValidationResult<DepartmentUpdateCommand["descriptions"]> {
  if (descriptions === undefined || descriptions === null) return okCommand(null);
  if (!Array.isArray(descriptions)) return failCommand("部门说明书格式错误");
  const result: NonNullable<DepartmentUpdateCommand["descriptions"]> = [];
  for (const description of descriptions) {
    const item = description && typeof description === "object" ? (description as Record<string, unknown>) : {};
    let detailsText: string | null = null;
    if (item.details !== undefined && item.details !== null && item.details !== "") {
      try {
        const parsed = typeof item.details === "string" ? JSON.parse(item.details) : item.details;
        detailsText = JSON.stringify(parsed);
      } catch {
        return failCommand("部门说明书 JSON 不是合法格式");
      }
    }
    result.push({
      id: item.id ? Number(item.id) : undefined,
      sourceFile: item.sourceFile ? String(item.sourceFile).trim() : "",
      codeRaw: item.codeRaw ? String(item.codeRaw).trim() : null,
      details: detailsText,
    });
  }
  return okCommand(result);
}

export async function buildDepartmentCreateCommand(
  input: DepartmentCreateInput,
): Promise<DomainValidationResult<DepartmentCreateCommand>> {
  const code = String(input.code || "").trim();
  const name = String(input.name || "").trim();
  const hierarchyKind = normalizeHierarchyKind(input.hierarchyKind);
  const level = Number(input.level || 1);
  const parentId = input.parentId == null || input.parentId === "" ? null : Number(input.parentId);
  const alias = input.alias == null || input.alias === "" ? null : String(input.alias).trim();
  const managerPositionId = input.managerPositionId == null || input.managerPositionId === "" ? null : Number(input.managerPositionId);
  if (managerPositionId !== null && (!Number.isInteger(managerPositionId) || managerPositionId <= 0)) return failCommand("负责人岗位无效", 400);
  const managerEmployeeIds = await validateManagerEmployees(input.managerEmployeeIds, managerPositionId);
  if (!managerEmployeeIds.ok) return managerEmployeeIds;
  if (!name) return failCommand("组织名不能为空");
  if (![1, 2, 3].includes(level)) return failCommand("组织层级不合法");
  if (await prisma.department.findFirst({ where: { code }, select: { id: true } })) return failCommand("组织编码已存在", 409);
  const parent = await resolveDepartmentParent(hierarchyKind, level, code, parentId);
  if (typeof parent === "string") return failCommand(parent);
  const descriptions = normalizeDescriptionList(input.descriptions);
  if (!descriptions.ok) return descriptions;
  return okCommand({ code, name, alias, hierarchyKind, level, parentId: parent.parentId, managerPositionId, managerEmployeeIds: managerEmployeeIds.data ?? [], descriptions: descriptions.data });
}

export async function buildDepartmentFieldUpdateCommand(field: string, value: unknown, id?: number) {
  if (field === "parentId") {
    const parent = await validateNullableFk("hr.department", value, "上级组织");
    return parent.ok ? okCommand({ field, value: parent.data }) : parent;
  }
  if (field === "managerPositionId") {
    if (!id) return failCommand("缺少组织ID");
    const managerPosition = await validateManagerPosition(value, id);
    return managerPosition.ok ? okCommand({ field, value: managerPosition.data }) : managerPosition;
  }
  if (field === "managerEmployeeIds") {
    if (!id) return failCommand("缺少组织ID");
    const department = await prisma.department.findUnique({ where: { id }, select: { managerPositionId: true } });
    if (!department) return failCommand("组织不存在", 404);
    const managers = await validateManagerEmployees(value, department.managerPositionId);
    return managers.ok ? okCommand({ field, value: managers.data }) : managers;
  }
  if (field === "isArchived") {
    const archived = Boolean(value);
    if (archived && id) {
      const blockMessage = await guardDepartmentArchive(id);
      if (blockMessage) return failCommand(blockMessage, 409);
    }
    return okCommand({ field, value: archived });
  }
  return okCommand({ field, value });
}

export async function buildDepartmentUpdateCommand(input: DepartmentUpdateInput): Promise<DomainValidationResult<DepartmentUpdateCommand>> {
  const id = Number(input.id);
  if (!id) return failCommand("缺少id");

  const existing = await prisma.department.findUnique({
    where: { id },
    select: { code: true, hierarchyKind: true, level: true, parentId: true, managerPositionId: true },
  });
  if (!existing) return failCommand("组织不存在", 404);

  const data: Prisma.DepartmentUncheckedUpdateInput = {};
  if (input.code !== undefined) data.code = input.code;
  if (input.name !== undefined) data.name = input.name;
  if (input.alias !== undefined) data.alias = input.alias || null;
  if (input.hierarchyKind !== undefined) data.hierarchyKind = normalizeHierarchyKind(input.hierarchyKind);
  if (input.level !== undefined) data.level = input.level;

  let parentId: number | null = existing.parentId;
  if (input.parentId !== undefined) {
    const parent = await validateNullableFk("hr.department", input.parentId, "上级组织");
    if (!parent.ok) return parent;
    parentId = parent.data;
  }

  const code = input.code !== undefined ? input.code : existing.code;
  const hierarchyKind = input.hierarchyKind !== undefined ? normalizeHierarchyKind(input.hierarchyKind) : normalizeHierarchyKind(existing.hierarchyKind);
  const level = input.level !== undefined ? Number(input.level) : existing.level;

  if (![1, 2, 3].includes(level)) return failCommand("组织层级不合法");

  if (input.code !== undefined && input.code !== existing.code) {
    const duplicate = await prisma.department.findFirst({ where: { code: input.code }, select: { id: true } });
    if (duplicate) return failCommand("组织编码已存在", 409);
  }

  const parent = await resolveDepartmentParent(hierarchyKind, level, code, parentId);
  if (typeof parent === "string") return failCommand(parent);
  parentId = parent.parentId;
  data.parentId = parentId;

  if (await hasCyclicParent(id, parentId)) return failCommand("不能将当前组织或其子孙组织设为上级", 409);

  let managerPositionId = existing.managerPositionId;
  if (input.managerPositionId !== undefined) {
    const managerPosition = await validateManagerPosition(input.managerPositionId, id);
    if (!managerPosition.ok) return managerPosition;
    data.managerPositionId = managerPosition.data;
    managerPositionId = managerPosition.data;
  }
  const managerEmployees = await validateManagerEmployees(input.managerEmployeeIds, managerPositionId);
  if (!managerEmployees.ok) return managerEmployees;
  if (input.isArchived !== undefined) {
    const archived = Boolean(input.isArchived);
    if (archived) {
      const blockMessage = await guardDepartmentArchive(id);
      if (blockMessage) return failCommand(blockMessage, 409);
    }
    data.isArchived = archived;
    data.archivedAt = archived ? new Date() : null;
  }

  const descriptions = normalizeDescriptionList(input.descriptions);
  if (!descriptions.ok) return descriptions;
  return okCommand({ id, data, managerEmployeeIds: managerEmployees.data, descriptions: descriptions.data });
}

export async function validateDepartmentDelete(id: number, actionLabel = "删除组织") {
  const blockMessage = await guardDepartmentArchive(id, actionLabel);
  return blockMessage ? failCommand(blockMessage, 409) : okCommand(true);
}
