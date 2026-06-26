import { Prisma } from "@workspace/platform/server/prisma";
import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import { validateFkValue } from "@workspace/platform/server/fk-registry";
import { prisma } from "@workspace/platform/server/prisma";
import { HR_FK_REGISTRY } from "../fk-registry";
import { guardDepartmentArchive } from "../reference-guards";

export const DEPARTMENT_ALLOWED_FIELDS = ["code", "name", "alias", "level", "levelLabel", "parentId", "managerUserId", "isArchived", "archivedAt"];

export interface DepartmentCreateInput {
  code?: unknown;
  name?: unknown;
  level?: unknown;
  parentId?: unknown;
  alias?: unknown;
  descriptions?: unknown;
}

export interface DepartmentUpdateInput {
  id?: unknown;
  code?: string;
  name?: string;
  alias?: string | null;
  level?: number;
  parentId?: number | string | null;
  managerUserId?: number | string | null;
  isArchived?: boolean;
  archivedAt?: Date | string | null;
  descriptions?: unknown;
}

export interface DepartmentUpdateCommand {
  id: number;
  data: Prisma.DepartmentUncheckedUpdateInput;
  descriptions: Array<{ id?: number; code: string; name: string; sourceFile: string; codeRaw?: string | null; details?: string | null }> | null;
}

function departmentPrefix(code: string) {
  const prefix = code.slice(0, 3);
  return /^[A-Z]{3}$/.test(prefix) ? prefix : "";
}

function departmentNumber(code: string) {
  const suffix = code.slice(3);
  return /^\d+$/.test(suffix) ? suffix : "";
}

async function validateDepartmentParent(level: number, code: string, parentId: number | null) {
  if (level === 1) {
    if (!/^[A-Z]{3}001$/.test(code)) return "L1 部门编码必须是 3 位大写字母加 001";
    return null;
  }
  if (!parentId || !Number.isInteger(parentId)) return `L${level} 部门必须选择上级部门`;
  const parent = await prisma.department.findUnique({ where: { id: parentId }, select: { code: true, level: true } });
  if (!parent) return "上级部门不存在";
  if (parent.level !== level - 1) return `L${level} 部门只能挂在 L${level - 1} 部门下`;
  const prefix = departmentPrefix(parent.code);
  if (!prefix || !code.startsWith(prefix)) return "部门编码必须继承上级部门前缀";
  const number = departmentNumber(code);
  if (!number) return `L${level} 编码必须是前缀后接纯数字`;
  if (level === 2 && !/^[1-9]\d*00$/.test(number)) return "L2 编码数字段必须为正整数并以 00 结尾";
  if (level === 3) {
    const parentNumber = departmentNumber(parent.code);
    if (!parentNumber.endsWith("00")) return "上级 L2 编码不合法";
    const tail = number.slice(-2);
    if (number.length !== parentNumber.length || number.slice(0, -2) !== parentNumber.slice(0, -2) || tail === "00") {
      return `L3 编码必须只替换 ${parentNumber} 的最后两位`;
    }
  }
  return null;
}

async function validateNullableFk(fkKey: string, value: unknown, requiredLabel: string) {
  const validation = await validateFkValue(HR_FK_REGISTRY, { fkKey, value, requiredLabel });
  return validation.ok ? okCommand(validation.value) : failCommand(validation.error, validation.status);
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
    if (!item.code || !item.name) return failCommand("部门说明书编码和名称不能为空");
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
      code: String(item.code).trim(),
      name: String(item.name).trim(),
      sourceFile: item.sourceFile ? String(item.sourceFile).trim() : "",
      codeRaw: item.codeRaw ? String(item.codeRaw).trim() : null,
      details: detailsText,
    });
  }
  return okCommand(result);
}

export async function buildDepartmentCreateCommand(input: DepartmentCreateInput) {
  const code = String(input.code || "").trim();
  const name = String(input.name || "").trim();
  const level = Number(input.level || 1);
  const parentId = input.parentId == null || input.parentId === "" ? null : Number(input.parentId);
  const alias = input.alias == null || input.alias === "" ? null : String(input.alias).trim();
  if (!name) return failCommand("部门名不能为空");
  if (![1, 2, 3].includes(level)) return failCommand("部门层级不合法");
  if (await prisma.department.findFirst({ where: { code }, select: { id: true } })) return failCommand("部门编码已存在", 409);
  const parentError = await validateDepartmentParent(level, code, parentId);
  if (parentError) return failCommand(parentError);
  const descriptions = normalizeDescriptionList(input.descriptions);
  if (!descriptions.ok) return descriptions;
  return okCommand({ code, name, alias, level, parentId: level === 1 ? null : parentId, descriptions: descriptions.data });
}

export async function buildDepartmentFieldUpdateCommand(field: string, value: unknown, id?: number) {
  if (field === "parentId") {
    const parent = await validateNullableFk("hr.department", value, "上级部门");
    return parent.ok ? okCommand({ field, value: parent.data }) : parent;
  }
  if (field === "managerUserId") {
    const manager = await validateNullableFk("platform.user", value, "负责人");
    return manager.ok ? okCommand({ field, value: manager.data }) : manager;
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
    select: { code: true, level: true, parentId: true },
  });
  if (!existing) return failCommand("部门不存在", 404);

  const data: Prisma.DepartmentUncheckedUpdateInput = {};
  if (input.code !== undefined) data.code = input.code;
  if (input.name !== undefined) data.name = input.name;
  if (input.alias !== undefined) data.alias = input.alias || null;
  if (input.level !== undefined) data.level = input.level;

  let parentId: number | null = existing.parentId;
  if (input.parentId !== undefined) {
    const parent = await validateNullableFk("hr.department", input.parentId, "上级部门");
    if (!parent.ok) return parent;
    parentId = parent.data;
  }

  const code = input.code !== undefined ? input.code : existing.code;
  const level = input.level !== undefined ? Number(input.level) : existing.level;

  if (![1, 2, 3].includes(level)) return failCommand("部门层级不合法");

  if (input.code !== undefined && input.code !== existing.code) {
    const duplicate = await prisma.department.findFirst({ where: { code: input.code }, select: { id: true } });
    if (duplicate) return failCommand("部门编码已存在", 409);
  }

  if (level === 1) {
    parentId = null;
  }
  data.parentId = parentId;

  if (await hasCyclicParent(id, parentId)) return failCommand("不能将当前部门或其子孙部门设为上级", 409);

  const parentError = await validateDepartmentParent(level, code, parentId);
  if (parentError) return failCommand(parentError);

  if (input.managerUserId !== undefined) {
    const manager = await validateNullableFk("platform.user", input.managerUserId, "负责人");
    if (!manager.ok) return manager;
    data.managerUserId = manager.data;
  }
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
  return okCommand({ id, data, descriptions: descriptions.data });
}

export async function validateDepartmentDelete(id: number, actionLabel = "删除部门") {
  const blockMessage = await guardDepartmentArchive(id, actionLabel);
  return blockMessage ? failCommand(blockMessage, 409) : okCommand(true);
}
