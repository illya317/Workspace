import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { mapValidationToServiceResult } from "@workspace/platform/server/domain-validation";
import type { DeleteGuardContext } from "@workspace/platform/server/delete-guard";
import { currentOpenEndedDateWhere } from "@workspace/platform/server/fk-registry";
import { snapshotHistory } from "@workspace/platform/server/history";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { fkDisplay, resolveFkValues } from "@workspace/platform/server/resolve-fk";
import { handleDelete, handleUpdateField } from "./hr-crud";
import { matchAnyField, matchEmployee, matchText } from "@workspace/platform/search";
import {
  buildEmployeeCreateCommand,
  buildEmployeeFieldUpdateCommand,
  EMPLOYEE_ALLOWED_FIELDS,
  validateEmployeeDeleteCommand,
} from "./domain/employee-validation";
import { primaryContractCompany } from "./employments";
import { employeePositionFilterInclude, employeePositionMatches } from "./employee-position-filters";

const EMPLOYEE_ID_PATTERN = /^\d{5}$/;
const USERNAME_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
const EMPLOYEE_DIRECTORY_FILTER_FIELDS = new Set(["gender", "education", "positionName", "directDepartmentName"]);
const FAST_DIRECTORY_FILTER_FIELDS = new Set(["gender", "education"]);

function randomUsername() {
  const bytes = randomBytes(8);
  return Array.from(bytes, (byte) => USERNAME_CHARS[byte % USERNAME_CHARS.length]).join("");
}

async function nextEmployeeId() {
  const employees = await prisma.employee.findMany({ select: { employeeId: true } });
  const usedIds = new Set(
    employees.filter((employee) => EMPLOYEE_ID_PATTERN.test(employee.employeeId)).map((employee) => employee.employeeId),
  );

  for (let next = 1; next <= 99999; next += 1) {
    const employeeId = String(next).padStart(5, "0");
    if (!usedIds.has(employeeId)) return employeeId;
  }

  throw new Error("员工编号已用尽");
}

async function uniqueUsername() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const username = randomUsername();
    const exists = await prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (!exists) return username;
  }
  throw new Error("账号生成失败，请重试");
}

function formatAlias(value: string | null) {
  if (!value) return "";
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)).join("、") : value;
  } catch {
    return value;
  }
}

async function normalizeEmployeeFieldUpdate(field: string, value: unknown) {
  const command = await buildEmployeeFieldUpdateCommand(field, value);
  return command.ok ? command.data : { error: command.issue.message, status: command.issue.status };
}

async function normalizeEmployeeDelete(id: number, context: DeleteGuardContext) {
  const command = await validateEmployeeDeleteCommand(id);
  if (!command.ok) return { error: command.issue.message, status: command.issue.status };
  const [salaryCount, shipmentCount, workshopCount, projectMemberCount] = await Promise.all([
    context.tx.financeSalesSalary.count({ where: { employeeId: command.data.id } }),
    context.tx.financeShipment.count({ where: { employeeId: command.data.id } }),
    context.tx.financeWorkshopReport.count({ where: { employeeId: command.data.id } }),
    context.tx.employeeProject.count({ where: currentOpenEndedDateWhere({ employeeId: command.data.id }) }),
  ]);
  const blocks = [
    salaryCount > 0 ? `财务销售工资 ${salaryCount} 条` : null,
    shipmentCount > 0 ? `财务发货明细 ${shipmentCount} 条` : null,
    workshopCount > 0 ? `财务车间日报 ${workshopCount} 条` : null,
    projectMemberCount > 0 ? `现用项目成员记录 ${projectMemberCount} 条` : null,
  ].filter(Boolean);
  if (blocks.length > 0) {
    return { error: `不能删除员工，请先处理引用：${blocks.join("、")}`, status: 409 };
  }
  await context.tx.employment.deleteMany({ where: { employeeId: command.data.id } });
  await context.tx.eDP.deleteMany({ where: { employeeId: command.data.id } });
  return { ok: true as const };
}

function getEmployeeDirectoryFilterValue(employee: Record<string, unknown>, field: string) {
  if (field === "gender") {
    if (employee.gender === true) return "男";
    if (employee.gender === false) return "女";
    return "";
  }
  return String(employee[field] ?? "");
}

function activeFilterValue(value: string | null | undefined) {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function buildFastDirectoryWhere(input: {
  isActive: boolean | null;
  filterField?: string;
  filterValue?: string;
}): Prisma.EmployeeWhereInput {
  const where: Prisma.EmployeeWhereInput = {};
  if (input.isActive === true) where.employments = { some: { isActive: true } };
  if (input.isActive === false) where.employments = { none: { isActive: true } };
  if (input.filterField === "gender" && input.filterValue) {
    if (input.filterValue === "男") where.gender = true;
    if (input.filterValue === "女") where.gender = false;
  }
  if (input.filterField === "education" && input.filterValue) {
    where.education = { contains: input.filterValue };
  }
  return where;
}

function attachEmployeeDirectoryFields<T extends { employments: Array<{ isActive: boolean; currentCompany: string | null; contracts: string | null }>; positions: Array<{ position?: { name: string | null; department?: { name: string | null } | null } | null; department?: { name: string | null } | null }> }>(employees: T[]) {
  for (const employee of employees) {
    const primaryPosition = employee.positions[0];
    (employee as Record<string, unknown>).positionName = primaryPosition?.position?.name ?? null;
    (employee as Record<string, unknown>).directDepartmentName =
      primaryPosition?.position?.department?.name ?? primaryPosition?.department?.name ?? null;
    const currentEmployment = employee.employments.find((employment) => employment.isActive) ?? employee.employments[0];
    (employee as Record<string, unknown>).currentCompany = currentEmployment
      ? primaryContractCompany(currentEmployment.contracts, currentEmployment.currentCompany)
      : null;
  }
}

export async function listEmployees(input: {
  employmentStatus?: "active" | "inactive";
  isActive?: string | null;
  company?: string;
  department?: string;
  position?: string;
  keyword: string;
  filterField?: string;
  filterValue?: string;
  page: number;
  pageSize: number;
}) {
  const isActive = activeFilterValue(input.isActive ?? (input.employmentStatus === "active" ? "true" : input.employmentStatus === "inactive" ? "false" : null));
  const canUseFastDirectoryQuery =
    !input.keyword
    && !input.company
    && !input.department
    && !input.position
    && (!input.filterField || FAST_DIRECTORY_FILTER_FIELDS.has(input.filterField));

  if (canUseFastDirectoryQuery) {
    const where = buildFastDirectoryWhere({
      isActive,
      filterField: input.filterField,
      filterValue: input.filterValue,
    });
    const [total, employees] = await Promise.all([
      prisma.employee.count({ where }),
      prisma.employee.findMany({
        where,
        include: {
          employments: {
            select: { isActive: true, currentCompany: true, contracts: true },
            orderBy: [{ isActive: "desc" }, { id: "desc" }],
          },
          positions: {
            include: employeePositionFilterInclude,
            orderBy: [{ isPrimary: "desc" }, { id: "asc" }],
          },
        },
        orderBy: { id: "asc" },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
    ]);
    attachEmployeeDirectoryFields(employees);
    const fkMap = await resolveFkValues(employees as unknown as Record<string, unknown>[]);
    for (const employee of employees) {
      (employee as Record<string, unknown>).userIdName = fkDisplay("userId", String(employee.userId ?? ""), fkMap);
    }
    return { employees, total };
  }

  let employees = await prisma.employee.findMany({
    include: {
      employments: {
        select: { isActive: true, currentCompany: true, contracts: true },
        orderBy: [{ isActive: "desc" }, { id: "desc" }],
      },
      positions: {
        include: employeePositionFilterInclude,
        orderBy: [{ isPrimary: "desc" }, { id: "asc" }],
      },
    },
    orderBy: { id: "asc" },
  });
  attachEmployeeDirectoryFields(employees);
  if (isActive !== null) {
    employees = employees.filter((employee) => {
      const hasActiveEmployment = employee.employments.some((employment) => employment.isActive);
      return isActive ? hasActiveEmployment : !hasActiveEmployment;
    });
  }
  if (input.company) {
    employees = employees.filter((employee) =>
      employee.employments
        .filter((employment) => isActive === null || employment.isActive === isActive)
        .some((employment) => primaryContractCompany(employment.contracts, employment.currentCompany) === input.company),
    );
  }
  if (input.department || input.position) {
    employees = employees.filter((employee) =>
      employeePositionMatches(employee.positions, { department: input.department, position: input.position }),
    );
  }
  if (input.keyword) employees = employees.filter((employee) => matchAnyField(employee, input.keyword, "Employee"));
  if (input.filterField && input.filterValue && EMPLOYEE_DIRECTORY_FILTER_FIELDS.has(input.filterField)) {
    employees = employees.filter((employee) => matchText(getEmployeeDirectoryFilterValue(employee as unknown as Record<string, unknown>, input.filterField!), input.filterValue!));
  }

  const total = employees.length;
  const start = (input.page - 1) * input.pageSize;
  const paged = employees.slice(start, start + input.pageSize);

  const fkMap = await resolveFkValues(paged as unknown as Record<string, unknown>[]);
  for (const employee of paged) {
    (employee as Record<string, unknown>).userIdName = fkDisplay("userId", String(employee.userId ?? ""), fkMap);
  }

  return { employees: paged, total };
}

export async function createEmployeeWithAccount(name: string, editorUserId: number) {
  const command = mapValidationToServiceResult(buildEmployeeCreateCommand(name));
  if (!command.ok) return command;

  const employeeId = await nextEmployeeId();
  const username = await uniqueUsername();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const linkedUser = await tx.user.create({
        data: {
          nickname: command.data.name,
          username,
          employeeId,
          canLogin: true,
        },
        select: { id: true, nickname: true, username: true, employeeId: true },
      });
      const employee = await tx.employee.create({
        data: {
          employeeId,
          name: command.data.name,
          userId: linkedUser.id,
        },
      });
      return { employee, user: linkedUser };
    });

    await snapshotHistory("Employee", result.employee.id, editorUserId);
    return { ok: true as const, ...result };
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint failed")) {
      return { ok: false as const, error: "员工编号或账号生成冲突，请重试", status: 409 };
    }
    throw error;
  }
}

export async function updateEmployeeField(request: Request, params: Promise<{ id: string }>) {
  return handleUpdateField(request, params, {
    entityType: "Employee",
    modelKey: "employee" as const,
    allowedFields: EMPLOYEE_ALLOWED_FIELDS,
    onBeforeUpdate: normalizeEmployeeFieldUpdate,
  });
}

export async function deleteEmployee(request: Request, params: Promise<{ id: string }>) {
  return handleDelete(request, params, {
    entityType: "Employee",
    modelKey: "employee" as const,
    allowedFields: EMPLOYEE_ALLOWED_FIELDS,
    deleteMode: "hard" as const,
    onBeforeUpdate: normalizeEmployeeFieldUpdate,
    onBeforeDelete: normalizeEmployeeDelete,
  });
}

export async function searchEmployeesForAccountLink(q: string) {
  const allEmployees = await prisma.employee.findMany({
    select: {
      id: true,
      employeeId: true,
      name: true,
      alias: true,
      user: { select: { id: true } },
      positions: {
        select: {
          department: { select: { name: true } },
          position: { select: { name: true } },
        },
      },
    },
  });

  const matched = allEmployees.filter((employee) => {
    if (!q) return false;
    return matchEmployee(employee, q);
  });

  const items: Array<{
    rowId: number;
    employeeId: string;
    name: string;
    alias: string;
    dept1: string;
    position: string;
    userId: number | null;
  }> = [];
  const seen = new Set<string>();

  for (const employee of matched) {
    if (employee.positions.length === 0) {
      const key = `${employee.id}||`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        rowId: employee.id,
        employeeId: employee.employeeId,
        name: employee.name,
        alias: formatAlias(employee.alias),
        dept1: "",
        position: "",
        userId: employee.user?.id ?? null,
      });
    } else {
      for (const position of employee.positions) {
        const deptName = position.department?.name || "";
        const posName = position.position?.name || "";
        const key = `${employee.id}|${deptName}|${posName}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({
          rowId: employee.id,
          employeeId: employee.employeeId,
          name: employee.name,
          alias: formatAlias(employee.alias),
          dept1: deptName,
          position: posName,
          userId: employee.user?.id ?? null,
        });
      }
    }
    if (items.length >= 20) break;
  }

  return items;
}

export function employeeErrorResponse(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}
