import { Prisma } from "@workspace/platform/server/prisma";
import { validateFkValue } from "@workspace/platform/server/fk-registry";
import { snapshotHistory } from "@workspace/platform/server/history";
import { prisma } from "@workspace/platform/server/prisma";
import { matchAnyField } from "@workspace/platform/search";
import { getCompanyNameSync, loadCompanyMap } from "./company-directory";
import { handleDelete, handleUpdateField } from "./hr-crud";
import { HR_FK_REGISTRY } from "./fk-registry";
import { guardDepartmentArchive } from "./reference-guards";

type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

const DEPARTMENT_FIELDS = ["code", "name", "alias", "level", "levelLabel", "parentId", "managerUserId", "isArchived", "archivedAt"];
const DEPARTMENT_CONFIG = {
  entityType: "Department",
  modelKey: "department" as const,
  allowedFields: DEPARTMENT_FIELDS,
  onBeforeUpdate: normalizeDepartmentFieldUpdate,
  onBeforeDelete: async (id: number) => {
    const blockMessage = await guardDepartmentArchive(id, "删除部门");
    return blockMessage ? { error: blockMessage, status: 409 } : { ok: true as const };
  },
};

interface DepartmentCreateInput {
  code?: unknown;
  name?: unknown;
  level?: unknown;
  parentId?: unknown;
}

interface DepartmentUpdateInput {
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

async function normalizeDepartmentFieldUpdate(field: string, value: unknown, id?: number) {
  if (field === "parentId") {
    const validation = await validateFkValue(HR_FK_REGISTRY, {
      fkKey: "hr.department",
      value,
      requiredLabel: "上级部门",
    });
    if (!validation.ok) return { error: validation.error, status: validation.status };
    return { field, value: validation.value };
  }
  if (field === "managerUserId") {
    const validation = await validateFkValue(HR_FK_REGISTRY, {
      fkKey: "platform.user",
      value,
      requiredLabel: "负责人",
    });
    if (!validation.ok) return { error: validation.error, status: validation.status };
    return { field, value: validation.value };
  }
  if (field === "isArchived") {
    const archived = Boolean(value);
    if (archived && id) {
      const blockMessage = await guardDepartmentArchive(id);
      if (blockMessage) return { error: blockMessage, status: 409 };
    }
    return { field, value: archived };
  }
  return { field, value };
}

function parseDetails(details: string | null) {
  if (!details) return null;
  try {
    const parsed = JSON.parse(details);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function departmentPrefix(code: string) {
  const prefix = code.slice(0, 3);
  return /^[A-Z]{3}$/.test(prefix) ? prefix : "";
}

function departmentNumber(code: string) {
  const suffix = code.slice(3);
  return /^\d+$/.test(suffix) ? suffix : "";
}

async function validateDepartmentCreate(input: DepartmentCreateInput): Promise<ServiceResult<{
  code: string;
  name: string;
  level: number;
  parentId: number | null;
}>> {
  const code = String(input.code || "").trim();
  const name = String(input.name || "").trim();
  const level = Number(input.level || 1);
  const parentId = input.parentId == null || input.parentId === "" ? null : Number(input.parentId);
  if (!name) return { ok: false, error: "部门名不能为空" };
  if (![1, 2, 3].includes(level)) return { ok: false, error: "部门层级不合法" };
  if (await prisma.department.findFirst({ where: { code }, select: { id: true } })) {
    return { ok: false, error: "部门编码已存在", status: 409 };
  }
  if (level === 1) {
    if (!/^[A-Z]{3}001$/.test(code)) return { ok: false, error: "L1 部门编码必须是 3 位大写字母加 001" };
    return { ok: true, data: { code, name, level, parentId: null } };
  }
  if (!parentId || !Number.isInteger(parentId)) return { ok: false, error: `L${level} 部门必须选择上级部门` };
  const parent = await prisma.department.findUnique({ where: { id: parentId }, select: { code: true, level: true } });
  if (!parent) return { ok: false, error: "上级部门不存在" };
  if (parent.level !== level - 1) return { ok: false, error: `L${level} 部门只能挂在 L${level - 1} 部门下` };
  const prefix = departmentPrefix(parent.code);
  if (!prefix || !code.startsWith(prefix)) return { ok: false, error: "部门编码必须继承上级部门前缀" };
  const number = departmentNumber(code);
  if (!number) return { ok: false, error: `L${level} 编码必须是前缀后接纯数字` };
  if (level === 2) {
    if (!/^[1-9]\d*00$/.test(number)) return { ok: false, error: "L2 编码数字段必须为正整数并以 00 结尾" };
  } else {
    const parentNumber = departmentNumber(parent.code);
    if (!parentNumber.endsWith("00")) return { ok: false, error: "上级 L2 编码不合法" };
    const tail = number.slice(-2);
    if (number.length !== parentNumber.length || number.slice(0, -2) !== parentNumber.slice(0, -2) || tail === "00") {
      return { ok: false, error: `L3 编码必须只替换 ${parentNumber} 的最后两位` };
    }
  }
  return { ok: true, data: { code, name, level, parentId } };
}

export async function listDepartments(input: { keyword: string; page: number; pageSize: number; archived?: boolean }) {
  const [depts, companyMap] = await Promise.all([
    prisma.department.findMany({
      where: { isArchived: Boolean(input.archived) },
      include: {
        _count: { select: { edps: true } },
        parent: { select: { id: true, name: true } },
        children: { select: { id: true, name: true } },
        manager: { select: { id: true, name: true } },
        descriptions: {
          select: { id: true, code: true, name: true, sourceFile: true, codeRaw: true, details: true },
          orderBy: { id: "asc" },
        },
      },
      orderBy: input.archived ? [{ archivedAt: "desc" }, { id: "desc" }] : { id: "asc" },
    }),
    loadCompanyMap(),
  ]);

  let departments = depts.map((department) => ({
    id: department.id,
    code: department.code,
    name: department.name,
    alias: department.alias || null,
    company: getCompanyNameSync(companyMap, department.code),
    level: department.level,
    levelLabel: department.level === 1 ? "事业部" : department.level === 2 ? "部门" : "子部门",
    parentId: department.parentId,
    parentName: department.parent?.name || null,
    managerUserId: department.managerUserId,
    managerName: department.manager?.name || null,
    isArchived: department.isArchived,
    archivedAt: department.archivedAt?.toISOString() || null,
    headcount: department._count.edps,
    children: department.children.map((child) => ({ id: child.id, name: child.name })),
    descriptions: department.descriptions.map((description) => ({
      id: description.id,
      code: description.code,
      name: description.name,
      sourceFile: description.sourceFile,
      codeRaw: description.codeRaw,
      details: parseDetails(description.details),
    })),
  }));
  if (input.keyword) departments = departments.filter((department) => matchAnyField(department, input.keyword, "Department"));

  const total = departments.length;
  const start = (input.page - 1) * input.pageSize;
  return { departments: departments.slice(start, start + input.pageSize), total };
}

export async function createDepartment(input: DepartmentCreateInput, userId: number) {
  const validation = await validateDepartmentCreate(input);
  if (!validation.ok) return validation;
  try {
    const record = await prisma.department.create({
      data: { ...validation.data, editedBy: userId },
    });
    await snapshotHistory("Department", record.id, userId);
    return { ok: true as const, data: { success: true, record } };
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return { ok: false as const, error: "上级部门不存在" };
    }
    throw error;
  }
}

function normalizeDescriptionList(descriptions: unknown): ServiceResult<Array<{
  id?: number;
  code: string;
  name: string;
  sourceFile: string;
  codeRaw?: string | null;
  details?: string | null;
}> | null> {
  if (descriptions === undefined || descriptions === null) return { ok: true, data: null };
  if (!Array.isArray(descriptions)) return { ok: false, error: "部门说明书格式错误" };
  const result = [];
  for (const description of descriptions) {
    const item = description && typeof description === "object" ? (description as Record<string, unknown>) : {};
    if (!item.code || !item.name) return { ok: false, error: "部门说明书编码和名称不能为空" };
    let detailsText: string | null = null;
    if (item.details !== undefined && item.details !== null && item.details !== "") {
      try {
        const parsed = typeof item.details === "string" ? JSON.parse(item.details) : item.details;
        detailsText = JSON.stringify(parsed);
      } catch {
        return { ok: false, error: "部门说明书 JSON 不是合法格式" };
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
  return { ok: true, data: result };
}

export async function updateDepartment(input: DepartmentUpdateInput, userId: number) {
  const id = Number(input.id);
  if (!id) return { ok: false as const, error: "缺少id" };

  const data: Prisma.DepartmentUncheckedUpdateInput = {};
  if (input.code !== undefined) data.code = input.code;
  if (input.name !== undefined) data.name = input.name;
  if (input.alias !== undefined) data.alias = input.alias || null;
  if (input.level !== undefined) data.level = input.level;
  if (input.parentId !== undefined) data.parentId = input.parentId ? Number(input.parentId) : null;
  if (input.parentId !== undefined && input.parentId) {
    const validation = await validateFkValue(HR_FK_REGISTRY, {
      fkKey: "hr.department",
      value: input.parentId,
      requiredLabel: "上级部门",
    });
    if (!validation.ok) return { ok: false as const, error: validation.error, status: validation.status };
    data.parentId = validation.value;
  }
  if (input.managerUserId !== undefined) {
    const validation = await validateFkValue(HR_FK_REGISTRY, {
      fkKey: "platform.user",
      value: input.managerUserId,
      requiredLabel: "负责人",
    });
    if (!validation.ok) return { ok: false as const, error: validation.error, status: validation.status };
    data.managerUserId = validation.value;
  }
  if (input.isArchived !== undefined) {
    const archived = Boolean(input.isArchived);
    if (archived) {
      const blockMessage = await guardDepartmentArchive(id);
      if (blockMessage) return { ok: false as const, error: blockMessage, status: 409 };
    }
    data.isArchived = archived;
    data.archivedAt = archived ? new Date() : null;
  }
  data.editedBy = userId;
  data.editedAt = new Date();
  data.version = { increment: 1 };

  const descriptionDataList = normalizeDescriptionList(input.descriptions);
  if (!descriptionDataList.ok) return descriptionDataList;

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const department = await tx.department.update({ where: { id }, data });
      if (descriptionDataList.data) {
        for (const descriptionData of descriptionDataList.data) {
          if (descriptionData.id) {
            await tx.departmentDescription.update({
              where: { id: descriptionData.id },
              data: { ...descriptionData, editedBy: userId, editedAt: new Date() },
            });
          } else {
            await tx.departmentDescription.create({
              data: { ...descriptionData, departmentId: id, editedBy: userId, editedAt: new Date() },
            });
          }
        }
      }
      return department;
    });
    await snapshotHistory("Department", id, userId);
    return { ok: true as const, data: { success: true, department: updated } };
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false as const, error: "编码已存在", status: 409 };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return { ok: false as const, error: "部门不存在", status: 404 };
    }
    throw error;
  }
}

export async function deleteDepartment(idText: string | null) {
  if (!idText) return { ok: false as const, error: "缺少id" };
  const id = parseInt(idText, 10);
  const blockMessage = await guardDepartmentArchive(id, "删除部门");
  if (blockMessage) return { ok: false as const, error: blockMessage, status: 409 };
  try {
    await prisma.department.delete({ where: { id } });
    return { ok: true as const, data: { success: true } };
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return { ok: false as const, error: "部门不存在", status: 404 };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return { ok: false as const, error: "该部门下有关联岗位，无法删除", status: 409 };
    }
    throw error;
  }
}

export async function updateDepartmentField(request: Request, params: Promise<{ id: string }>) {
  return handleUpdateField(request, params, DEPARTMENT_CONFIG);
}

export async function deleteDepartmentByParams(request: Request, params: Promise<{ id: string }>) {
  return handleDelete(request, params, DEPARTMENT_CONFIG);
}
