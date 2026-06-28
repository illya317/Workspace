import { Prisma } from "@workspace/platform/server/prisma";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { mapValidationToServiceResult } from "@workspace/platform/server/domain-validation";
import { snapshotHistory } from "@workspace/platform/server/history";
import { prisma } from "@workspace/platform/server/prisma";
import { matchAnyField } from "@workspace/platform/search";
import { deriveDepartmentCodeCascade } from "@workspace/hr/utils/department-code-cascade";
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
  deleteMode: "hard" as const,
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

function selectedDetails(record: object): string | null {
  if (!("details" in record)) return null;
  return typeof record.details === "string" ? record.details : null;
}

function userEmployeeName(user: { nickname: string; employees?: Array<{ name: string }> } | null | undefined) {
  return user?.employees?.[0]?.name ?? user?.nickname ?? null;
}

export async function listDepartments(input: { keyword: string; page: number; pageSize: number; archived?: boolean; summary?: boolean }) {
  const [depts, companyMap] = await Promise.all([
    prisma.department.findMany({
      where: { isArchived: Boolean(input.archived) },
      include: {
        _count: { select: { edps: true } },
        parent: { select: { id: true, name: true } },
        children: { select: { id: true, name: true } },
        manager: { select: { id: true, nickname: true, employees: { select: { name: true }, take: 1 } } },
        descriptions: {
          select: input.summary
            ? { id: true, code: true, name: true, sourceFile: true, codeRaw: true }
            : { id: true, code: true, name: true, sourceFile: true, codeRaw: true, details: true },
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
    managerName: userEmployeeName(department.manager),
    isArchived: department.isArchived,
    archivedAt: department.archivedAt?.toISOString() || null,
    version: department.version,
    headcount: department._count.edps,
    children: department.children.map((child) => ({ id: child.id, name: child.name })),
    descriptions: department.descriptions.map((description) => ({
      id: description.id,
      code: description.code,
      name: description.name,
      sourceFile: description.sourceFile,
      codeRaw: description.codeRaw,
      details: parseDetails(selectedDetails(description)),
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
  const { descriptions, ...departmentData } = command.data;
  try {
    const record = await prisma.$transaction(async (tx) => {
      const department = await tx.department.create({
        data: { ...departmentData, editedBy: userId },
      });
      const descriptionList = descriptions && descriptions.length > 0
        ? descriptions.map((d) => ({ ...d, departmentId: department.id }))
        : [{
            departmentId: department.id,
            code: department.code,
            name: department.name,
            sourceFile: "",
            details: "{}",
            editedBy: userId,
            editedAt: new Date(),
          }];
      for (const descriptionData of descriptionList) {
        await tx.departmentDescription.create({ data: { ...descriptionData, editedBy: userId, editedAt: new Date() } });
      }
      await snapshotHistory("Department", department.id, userId, tx);
      return department;
    });
    return serviceOk({ success: true, record });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return serviceError("上级部门不存在");
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

  let cascade: ReturnType<typeof deriveDepartmentCodeCascade> | null = null;
  if (data.code !== undefined) {
    const existing = await prisma.department.findUnique({
      where: { id },
      select: { code: true, level: true },
    });
    if (existing && data.code !== existing.code) {
      const [allDepartments, allPositions] = await Promise.all([
        prisma.department.findMany({ select: { id: true, code: true, level: true, parentId: true } }),
        prisma.position.findMany({ select: { id: true, code: true, departmentId: true } }),
      ]);
      cascade = deriveDepartmentCodeCascade({
        changedDepartment: { id, code: existing.code, level: existing.level, parentId: null },
        newCode: String(data.code),
        departments: allDepartments,
        positions: allPositions,
      });
    }
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const department = await tx.department.update({ where: { id }, data });
      if (cascade) {
        for (const { id: deptId, code } of cascade.departments) {
          if (deptId === id) continue;
          await tx.department.update({
            where: { id: deptId },
            data: { code, editedBy: userId, editedAt: new Date(), version: { increment: 1 } },
          });
        }
        for (const { id: posId, code } of cascade.positions) {
          await tx.position.update({
            where: { id: posId },
            data: { code, editedBy: userId, editedAt: new Date(), version: { increment: 1 } },
          });
        }
      }
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
      await snapshotHistory("Department", id, userId, tx);
      return department;
    });
    return serviceOk({ success: true, department: updated });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return serviceError("编码已存在", 409);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return serviceError("部门不存在", 404);
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
