import { Prisma } from "@workspace/platform/server/prisma";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { mapValidationToServiceResult } from "@workspace/platform/server/domain-validation";
import { snapshotHistory } from "@workspace/platform/server/history";
import { prisma } from "@workspace/platform/server/prisma";
import { currentEmploymentDateWhere, currentOpenEndedDateWhere } from "@workspace/platform/server/relation-registry";
import { matchAnyField } from "@workspace/platform/search";
import { deriveDepartmentCodeCascade } from "@workspace/hr/utils/department-code-cascade";
import { getCompanyNameSync, loadCompanyMap } from "@workspace/platform/server/company-directory";
import { executeDelete, type CrudDeleteCommand } from "./hr-crud";
import {
  buildDepartmentUpdateCommand,
  validateDepartmentDelete,
  type DepartmentCreateCommand,
  type DepartmentUpdateInput,
  type DepartmentUpdateCommand,
} from "./domain/department-validation";
import {
  resolveHrDepartmentActionRuntime,
  type DepartmentMutationAuthorization,
} from "./department-action-runtime";

const DEPARTMENT_CONFIG = {
  entityType: "Department",
  modelKey: "department" as const,
  deleteMode: "hard" as const,
  onBeforeDelete: async (id: number) => {
    const command = await validateDepartmentDelete(id, "删除组织");
    return command.ok ? { ok: true as const } : { error: command.issue.message, status: command.issue.status };
  },
};

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

const managerEmployeeSelect = {
  id: true,
  name: true,
  userId: true,
} as const;

function hierarchyKind(value: string | null | undefined) {
  return value === "G" ? "G" : "M";
}

function organizationLevelCode(department: { hierarchyKind?: string | null; level: number }) {
  return `${hierarchyKind(department.hierarchyKind)}${department.level}`;
}

function organizationLevelLabel(department: { hierarchyKind?: string | null; level: number }) {
  const kind = hierarchyKind(department.hierarchyKind);
  if (kind === "G") {
    if (department.level === 1) return "治理层级 G1";
    if (department.level === 2) return "治理层级 G2";
    return "治理层级 G3";
  }
  if (department.level === 1) return "管理层级 M1";
  if (department.level === 2) return "管理层级 M2";
  return "管理层级 M3 / 子部门";
}

function managerEmployeeNames(
  managerPosition: {
    edps?: Array<{
      employee: {
        id: number;
        name: string;
        userId: number | null;
      };
    }>;
  } | null | undefined,
) {
  const byEmployee = new Map<number, {
    employeeId: number;
    userId: number | null;
    name: string;
  }>();
  for (const edp of managerPosition?.edps ?? []) {
    const employee = edp.employee;
    byEmployee.set(employee.id, {
      employeeId: employee.id,
      userId: employee.userId,
      name: employee.name || "未命名员工",
    });
  }
  return Array.from(byEmployee.values());
}

function managerEmployeesFromRows(rows: Array<{
  employee: {
    id: number;
    name: string;
    userId: number | null;
  };
}>) {
  return rows.map((row) => ({
    employeeId: row.employee.id,
    userId: row.employee.userId,
    name: row.employee.name || "未命名员工",
  }));
}

export async function listDepartments(input: { keyword: string; page: number; pageSize: number; archived?: boolean; summary?: boolean; userId?: number }) {
  const [depts, companyMap, actionRuntimes] = await Promise.all([
    prisma.department.findMany({
      where: { isArchived: Boolean(input.archived) },
      include: {
        _count: { select: { edps: true } },
        parent: { select: { id: true, name: true } },
        children: { select: { id: true, name: true } },
        managerPosition: {
          select: {
            id: true,
            name: true,
            code: true,
            edps: {
              where: currentOpenEndedDateWhere({
                employee: { employments: { some: currentEmploymentDateWhere() } },
              }),
              select: {
                employee: { select: managerEmployeeSelect },
              },
              orderBy: [{ isPrimary: "desc" }, { id: "asc" }],
            },
          },
        },
        managerEmployees: {
          select: {
            employee: { select: managerEmployeeSelect },
          },
          orderBy: { id: "asc" },
        },
        descriptions: {
          select: input.summary
            ? { id: true, sourceFile: true, codeRaw: true }
            : { id: true, sourceFile: true, codeRaw: true, details: true },
          orderBy: { id: "asc" },
        },
      },
      orderBy: input.archived ? [{ archivedAt: "desc" }, { id: "desc" }] : [{ hierarchyKind: "asc" }, { level: "asc" }, { id: "asc" }],
    }),
    loadCompanyMap(),
    input.userId
      ? Promise.all([
          resolveHrDepartmentActionRuntime(input.userId, "create"),
          resolveHrDepartmentActionRuntime(input.userId, "update"),
        ]).then(([create, update]) => ({ create, update }))
      : null,
  ]);

  let departments = depts.map((department) => {
    const selectedManagers = managerEmployeesFromRows(department.managerEmployees);
    const managers = selectedManagers.length > 0 ? selectedManagers : managerEmployeeNames(department.managerPosition);
    const managerNames = managers.map((manager) => manager.name);
    return {
      id: department.id,
      code: department.code,
      name: department.name,
      alias: department.alias || null,
      company: getCompanyNameSync(companyMap, department.code),
      hierarchyKind: hierarchyKind(department.hierarchyKind),
      level: department.level,
      levelCode: organizationLevelCode(department),
      levelLabel: organizationLevelLabel(department),
      parentId: department.parentId,
      parentName: department.parent?.name || null,
      managerPositionId: department.managerPositionId,
      managerPositionName: department.managerPosition?.name ?? null,
      managerEmployeeIds: managers.map((manager) => manager.employeeId),
      managerEmployeeNames: managerNames,
      managerNames,
      managerName: managerNames.join("、") || null,
      isArchived: department.isArchived,
      archivedAt: department.archivedAt?.toISOString() || null,
      version: department.version,
      headcount: department._count.edps,
      children: department.children.map((child) => ({ id: child.id, name: child.name })),
      descriptions: department.descriptions.map((description) => ({
        id: description.id,
        code: department.code,
        name: department.name,
        sourceFile: description.sourceFile,
        codeRaw: description.codeRaw,
        details: parseDetails(selectedDetails(description)),
      })),
    };
  });
  if (input.keyword) departments = departments.filter((department) => matchAnyField(department, input.keyword, "Department"));

  const total = departments.length;
  const start = (input.page - 1) * input.pageSize;
  return { departments: departments.slice(start, start + input.pageSize), total, actionRuntimes };
}

export async function commitDepartmentCreateCommand(
  command: DepartmentCreateCommand,
  userId: number,
) {
  const { descriptions, managerEmployeeIds, ...departmentData } = command;
  try {
    const record = await prisma.$transaction(async (tx) => {
      const department = await tx.department.create({
        data: { ...departmentData, editedBy: userId },
      });
      for (const employeeId of managerEmployeeIds) {
        await tx.departmentManagerEmployee.create({ data: { departmentId: department.id, employeeId } });
      }
      const descriptionList = descriptions && descriptions.length > 0
        ? descriptions.map((d) => ({ ...d, departmentId: department.id }))
        : [{
            departmentId: department.id,
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
      return serviceError("上级组织、负责人岗位或组织负责人不存在");
    }
    throw error;
  }
}

export async function commitDepartmentUpdateCommand(
  command: DepartmentUpdateCommand,
  userId: number,
) {
  const { id, managerEmployeeIds, descriptions } = command;
  const data: Prisma.DepartmentUncheckedUpdateInput = { ...command.data };
  data.editedBy = userId;
  data.editedAt = new Date();
  data.version = { increment: 1 };

  let cascade: ReturnType<typeof deriveDepartmentCodeCascade> | null = null;
  if (data.code !== undefined) {
    const existing = await prisma.department.findUnique({
      where: { id },
      select: { code: true, hierarchyKind: true, level: true },
    });
    if (existing && data.code !== existing.code) {
      const [allDepartments, allPositions] = await Promise.all([
        prisma.department.findMany({ select: { id: true, code: true, hierarchyKind: true, level: true, parentId: true } }),
        prisma.position.findMany({ select: { id: true, code: true, departmentId: true } }),
      ]);
      if (hierarchyKind(existing.hierarchyKind) === "M") {
        cascade = deriveDepartmentCodeCascade({
          changedDepartment: { id, code: existing.code, level: existing.level, parentId: null },
          newCode: String(data.code),
          departments: allDepartments.filter((department) => hierarchyKind(department.hierarchyKind) === "M"),
          positions: allPositions,
        });
      } else {
        cascade = {
          departments: [],
          positions: allPositions
            .filter((position) => position.departmentId === id)
            .map((position) => {
              const suffix = String(position.code || "").trim().split("-").pop() || "";
              return /^\d{1,2}$/.test(suffix) ? { id: position.id, code: `GW-${String(data.code)}-${suffix.padStart(2, "0")}` } : { id: position.id, code: position.code };
            })
            .filter((position) => allPositions.find((item) => item.id === position.id)?.code !== position.code),
        };
      }
    }
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const department = await tx.department.update({ where: { id }, data });
      if (managerEmployeeIds !== undefined) {
        await tx.departmentManagerEmployee.deleteMany({ where: { departmentId: id } });
        for (const employeeId of managerEmployeeIds) {
          await tx.departmentManagerEmployee.create({ data: { departmentId: id, employeeId } });
        }
      } else if (data.managerPositionId !== undefined) {
        await tx.departmentManagerEmployee.deleteMany({ where: { departmentId: id } });
      }
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
      return serviceError("组织不存在", 404);
    }
    throw error;
  }
}

export async function updateDepartment(
  input: DepartmentUpdateInput,
  userId: number,
  authorization?: DepartmentMutationAuthorization,
) {
  if (authorization !== "lifecycle") {
    return serviceError("组织更新必须通过 ActionContract command 执行", 500);
  }
  const command = mapValidationToServiceResult(await buildDepartmentUpdateCommand(input));
  if (!command.ok) return command;
  return commitDepartmentUpdateCommand(command.data, userId);
}

export async function deleteDepartment(command: CrudDeleteCommand) {
  return executeDelete(command, DEPARTMENT_CONFIG);
}
