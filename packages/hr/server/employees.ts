import { randomBytes } from "crypto";
import { mapValidationToServiceResult } from "@workspace/platform/server/domain-validation";
import type { DeleteGuardContext } from "@workspace/platform/server/delete-guard";
import { currentOpenEndedDateWhere } from "@workspace/platform/server/fk-registry";
import { ensureEditHistoryBaseline, snapshotHistory } from "@workspace/platform/server/history";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { checkHRUpdate } from "@workspace/platform/server/auth";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { uniqueUsernameFromName } from "@workspace/platform/server/usernames";
import { executeDelete, type CrudDeleteCommand } from "./hr-crud";
import { matchAnyField, matchEmployee, matchText } from "@workspace/platform/search";
import {
  buildEmployeeCreateCommand,
  buildEmployeeFieldUpdateCommand,
  EMPLOYEE_ALLOWED_FIELDS,
  validateEmployeeDeleteCommand,
} from "./domain/employee-validation";
import { primaryContractCompany } from "./employments";
import { employeePositionFilterInclude, employeePositionMatches } from "./employee-position-filters";
import { jsonErrorResponse } from "@workspace/platform/server/api";

const EMPLOYEE_ID_PATTERN = /^\d{5}$/;
const EMPLOYEE_DIRECTORY_FILTER_FIELDS = new Set(["gender", "education", "positionName", "directDepartmentName"]);
const EMPLOYEE_DIRECTORY_POSITION_FILTER_FIELDS = new Set(["positionName", "directDepartmentName"]);
const FAST_DIRECTORY_FILTER_FIELDS = new Set(["gender", "education"]);

interface EmployeeListDiagnostics {
  requestId: string;
  startedAt: number;
  startMemory: NodeJS.MemoryUsage;
  base: Record<string, unknown>;
}

function diagnosticsEnabled() {
  return process.env.NODE_ENV === "production" || process.env.HR_EMPLOYEE_LIST_DIAGNOSTICS === "1";
}

function toMiB(value: number) {
  return Math.round(value / 1024 / 1024);
}

function createEmployeeListDiagnostics(input: {
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
}, branch: "fast" | "slow"): EmployeeListDiagnostics | null {
  if (!diagnosticsEnabled()) return null;
  return {
    requestId: randomBytes(4).toString("hex"),
    startedAt: Date.now(),
    startMemory: process.memoryUsage(),
    base: {
      branch,
      page: input.page,
      pageSize: input.pageSize,
      employmentStatus: input.employmentStatus ?? null,
      isActive: input.isActive ?? null,
      hasKeyword: Boolean(input.keyword),
      keywordLength: input.keyword.length,
      hasCompany: Boolean(input.company),
      hasDepartment: Boolean(input.department),
      hasPosition: Boolean(input.position),
      filterField: input.filterField || null,
      hasFilterValue: Boolean(input.filterValue),
    },
  };
}

function logEmployeeListDiagnostics(
  diagnostics: EmployeeListDiagnostics | null,
  step: string,
  extra: Record<string, unknown> = {},
) {
  if (!diagnostics) return;
  const memory = process.memoryUsage();
  console.info("[hr.employees.list]", JSON.stringify({
    requestId: diagnostics.requestId,
    step,
    elapsedMs: Date.now() - diagnostics.startedAt,
    rssMiB: toMiB(memory.rss),
    heapUsedMiB: toMiB(memory.heapUsed),
    heapTotalMiB: toMiB(memory.heapTotal),
    externalMiB: toMiB(memory.external),
    arrayBuffersMiB: toMiB(memory.arrayBuffers),
    rssDeltaMiB: toMiB(memory.rss - diagnostics.startMemory.rss),
    heapUsedDeltaMiB: toMiB(memory.heapUsed - diagnostics.startMemory.heapUsed),
    ...diagnostics.base,
    ...extra,
  }));
}

async function nextEmployeeId() {
  const [employees, users] = await Promise.all([
    prisma.employee.findMany({ select: { employeeId: true } }),
    prisma.user.findMany({ where: { employeeId: { not: null } }, select: { employeeId: true } }),
  ]);
  const usedIds = new Set(
    employees.filter((employee) => EMPLOYEE_ID_PATTERN.test(employee.employeeId)).map((employee) => employee.employeeId),
  );
  for (const user of users) {
    if (user.employeeId && EMPLOYEE_ID_PATTERN.test(user.employeeId)) usedIds.add(user.employeeId);
  }

  for (let next = 1; next <= 99999; next += 1) {
    const employeeId = String(next).padStart(5, "0");
    if (!usedIds.has(employeeId)) return employeeId;
  }

  throw new Error("员工编号已用尽");
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
    where.education = { contains: input.filterValue, mode: "insensitive" };
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

async function attachEmployeeUserNames<T extends { userId?: number | null }>(employees: T[]) {
  const userIds = Array.from(new Set(
    employees
      .map((employee) => employee.userId)
      .filter((id): id is number => typeof id === "number" && Number.isInteger(id) && id > 0),
  ));
  if (userIds.length === 0) return;
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, employees: { select: { name: true }, take: 1 } },
  });
  const nameByUserId = new Map(users.map((user) => [user.id, user.employees[0]?.name || "未绑定员工"]));
  for (const employee of employees) {
    if (!employee.userId) continue;
    (employee as Record<string, unknown>).userIdName = nameByUserId.get(employee.userId) ?? String(employee.userId);
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
  const diagnostics = createEmployeeListDiagnostics(input, canUseFastDirectoryQuery ? "fast" : "slow");
  logEmployeeListDiagnostics(diagnostics, "start");

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
    logEmployeeListDiagnostics(diagnostics, "fast:query", { total, rows: employees.length });
    attachEmployeeDirectoryFields(employees);
    logEmployeeListDiagnostics(diagnostics, "fast:attach-directory-fields", { rows: employees.length });
    await attachEmployeeUserNames(employees);
    logEmployeeListDiagnostics(diagnostics, "fast:attach-user-names", { rows: employees.length });
    logEmployeeListDiagnostics(diagnostics, "fast:return", { total, rows: employees.length });
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
  logEmployeeListDiagnostics(diagnostics, "slow:query-all", { rows: employees.length });
  attachEmployeeDirectoryFields(employees);
  logEmployeeListDiagnostics(diagnostics, "slow:attach-directory-fields", { rows: employees.length });
  if (isActive !== null) {
    employees = employees.filter((employee) => {
      const hasActiveEmployment = employee.employments.some((employment) => employment.isActive);
      return isActive ? hasActiveEmployment : !hasActiveEmployment;
    });
    logEmployeeListDiagnostics(diagnostics, "slow:filter-active", { rows: employees.length });
  }
  if (input.company) {
    employees = employees.filter((employee) =>
      employee.employments
        .filter((employment) => isActive === null || employment.isActive === isActive)
        .some((employment) => primaryContractCompany(employment.contracts, employment.currentCompany) === input.company),
    );
    logEmployeeListDiagnostics(diagnostics, "slow:filter-company", { rows: employees.length });
  }
  if (input.department || input.position) {
    employees = employees.filter((employee) =>
      employeePositionMatches(employee.positions, { department: input.department, position: input.position }),
    );
    logEmployeeListDiagnostics(diagnostics, "slow:filter-position", { rows: employees.length });
  }
  if (input.keyword) {
    employees = employees.filter((employee) => matchAnyField(employee, input.keyword, "Employee"));
    logEmployeeListDiagnostics(diagnostics, "slow:filter-keyword", { rows: employees.length });
  }
  if (input.filterField && input.filterValue && EMPLOYEE_DIRECTORY_POSITION_FILTER_FIELDS.has(input.filterField)) {
    employees = employees.filter((employee) =>
      employeePositionMatches(employee.positions, {
        department: input.filterField === "directDepartmentName" ? input.filterValue : undefined,
        position: input.filterField === "positionName" ? input.filterValue : undefined,
      }),
    );
    logEmployeeListDiagnostics(diagnostics, "slow:filter-directory-position", { rows: employees.length });
  } else
  if (input.filterField && input.filterValue && EMPLOYEE_DIRECTORY_FILTER_FIELDS.has(input.filterField)) {
    employees = employees.filter((employee) => matchText(getEmployeeDirectoryFilterValue(employee as unknown as Record<string, unknown>, input.filterField!), input.filterValue!));
    logEmployeeListDiagnostics(diagnostics, "slow:filter-directory-field", { rows: employees.length });
  }

  const total = employees.length;
  const start = (input.page - 1) * input.pageSize;
  const paged = employees.slice(start, start + input.pageSize);
  logEmployeeListDiagnostics(diagnostics, "slow:paginate", { total, rows: paged.length });

  await attachEmployeeUserNames(paged);
  logEmployeeListDiagnostics(diagnostics, "slow:attach-user-names", { total, rows: paged.length });

  logEmployeeListDiagnostics(diagnostics, "slow:return", { total, rows: paged.length });
  return { employees: paged, total };
}

export async function createEmployeeWithAccount(name: string, editorUserId: number) {
  const command = mapValidationToServiceResult(buildEmployeeCreateCommand(name));
  if (!command.ok) return command;

  const employeeId = await nextEmployeeId();
  const username = await uniqueUsernameFromName(command.data.name, { suffix: employeeId });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const linkedUser = await tx.user.create({
        data: {
          username,
          employeeId,
          canLogin: true,
        },
        select: { id: true, username: true, employeeId: true },
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

export async function updateEmployeeFieldById(input: {
  id: number;
  field: string;
  value: unknown;
  userId: number;
}) {
  const command = buildEmployeeFieldUpdateCommand(input.field, input.value);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status || 400);
  const employee = await prisma.employee.findUnique({
    where: { id: input.id },
    select: { employeeId: true },
  });
  if (!employee) return serviceError("员工不存在", 404);
  return updateEmployeeFieldsByEmployeeIds({
    employeeIds: [employee.employeeId],
    field: command.data.field,
    value: command.data.value,
    userId: input.userId,
  });
}

export async function updateEmployeeFieldsByEmployeeIds(input: {
  employeeIds: string[];
  field: string;
  value: unknown;
  userId: number;
}) {
  if (!(await checkHRUpdate(input.userId, "hr.roster"))) return serviceError("无 HR 编辑权限", 403);
  const direct = await assertBusinessActionDirectExecutionAllowed({
    businessActionKey: "hr.roster.employee.update",
    actorUserId: input.userId,
    resourceKey: "hr.roster",
    scopeType: "global",
    scopeId: null,
    blockedMessage: "员工更新已配置为必须走流程，智能体不能直接写入",
  });
  if (!direct.ok) return direct;
  if (!EMPLOYEE_ALLOWED_FIELDS.includes(input.field)) return serviceError("字段不允许修改", 400);
  const command = buildEmployeeFieldUpdateCommand(input.field, input.value);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status || 400);
  const employeeIds = Array.from(new Set(input.employeeIds.map((id) => id.trim()).filter(Boolean)));
  if (employeeIds.length === 0) return serviceError("缺少员工编号", 400);
  if (employeeIds.length > 500) return serviceError("批量更新上限 500", 400);
  const rows = await prisma.employee.findMany({
    where: { employeeId: { in: employeeIds } },
    select: { id: true, employeeId: true },
  });
  if (rows.length !== employeeIds.length) return serviceError("部分员工不存在，请刷新后重试", 404);
  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      await ensureEditHistoryBaseline("Employee", row.id, input.userId, tx);
      await tx.employee.update({
        where: { id: row.id },
        data: {
          [command.data.field]: command.data.value ?? null,
          editedBy: input.userId,
          editedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await snapshotHistory("Employee", row.id, input.userId, tx);
    }
  });
  return serviceOk({ updatedCount: rows.length });
}

export async function deleteEmployee(command: CrudDeleteCommand) {
  return executeDelete(command, {
    entityType: "Employee",
    modelKey: "employee" as const,
    deleteMode: "hard" as const,
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
  return jsonErrorResponse(error, status);
}
