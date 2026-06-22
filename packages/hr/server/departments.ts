import { Prisma } from "@workspace/platform/server/prisma";
import { mapValidationToServiceResult } from "@workspace/platform/server/domain-validation";
import { snapshotHistory } from "@workspace/platform/server/history";
import { prisma } from "@workspace/platform/server/prisma";
import { matchAnyField } from "@workspace/platform/search";
import { getCompanyNameSync, loadCompanyMap } from "./company-directory";
import { handleDelete, handleUpdateField } from "./hr-crud";
import {
  buildDepartmentCreateCommand,
  buildDepartmentFieldUpdateCommand,
  buildDepartmentUpdateCommand,
  DEPARTMENT_ALLOWED_FIELDS,
  validateDepartmentDelete,
  type DepartmentCreateInput,
  type DepartmentUpdateInput,
} from "./domain/department-validation";

const DEPARTMENT_CONFIG = {
  entityType: "Department",
  modelKey: "department" as const,
  allowedFields: DEPARTMENT_ALLOWED_FIELDS,
  onBeforeUpdate: normalizeDepartmentFieldUpdate,
  onBeforeDelete: async (id: number) => {
    const command = await validateDepartmentDelete(id, "删除部门");
    return command.ok ? { ok: true as const } : { error: command.issue.message, status: command.issue.status };
  },
};

async function normalizeDepartmentFieldUpdate(field: string, value: unknown, id?: number) {
  const command = await buildDepartmentFieldUpdateCommand(field, value, id);
  return command.ok ? command.data : { error: command.issue.message, status: command.issue.status };
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
  const command = mapValidationToServiceResult(await buildDepartmentCreateCommand(input));
  if (!command.ok) return command;
  try {
    const record = await prisma.department.create({
      data: { ...command.data, editedBy: userId },
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

export async function updateDepartment(input: DepartmentUpdateInput, userId: number) {
  const command = mapValidationToServiceResult(await buildDepartmentUpdateCommand(input));
  if (!command.ok) return command;
  const { id, data, descriptions } = command.data;
  data.editedBy = userId;
  data.editedAt = new Date();
  data.version = { increment: 1 };

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const department = await tx.department.update({ where: { id }, data });
      if (descriptions) {
        for (const descriptionData of descriptions) {
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
  const command = mapValidationToServiceResult(await validateDepartmentDelete(id, "删除部门"));
  if (!command.ok) return command;
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
