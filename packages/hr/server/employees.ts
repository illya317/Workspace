import { mapValidationToServiceResult } from "@workspace/platform/server/domain-validation";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import { currentEmploymentDateWhere, currentOpenEndedDateWhere, employmentIsActiveOnDate } from "@workspace/platform/server/relation-registry";
import { ensureEditHistoryBaseline, snapshotHistory } from "@workspace/platform/server/history";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { checkHRUpdate } from "@workspace/platform/server/auth";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { uniqueUsernameFromName } from "@workspace/platform/server/usernames";
import { matchAnyField, matchEmployee, matchText } from "@workspace/platform/search";
import {
  buildEmployeeCreateCommand,
  buildEmployeePageDraftCommand,
} from "./domain/employee-validation";
import { primaryContractCompany } from "./employments";
import { employeePositionFilterInclude, employeePositionMatches } from "./employee-position-filters";
import { jsonErrorResponse } from "@workspace/platform/server/api";
import { logEmployeeListDiagnostics, startEmployeeListDiagnostics } from "./employee-list-diagnostics";

const EMPLOYEE_ID_PATTERN = /^\d{5}$/;
const EMPLOYEE_DIRECTORY_FILTER_FIELDS = new Set(["gender", "education", "positionName", "directDepartmentName"]);
const EMPLOYEE_DIRECTORY_POSITION_FILTER_FIELDS = new Set(["positionName", "directDepartmentName"]);
const FAST_DIRECTORY_FILTER_FIELDS = new Set(["gender", "education"]);

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
  personnelType?: string;
  filterField?: string;
  filterValue?: string;
}): Prisma.EmployeeWhereInput {
  const where: Prisma.EmployeeWhereInput = {};
  if (input.personnelType) {
    where.employments = {
      some: input.isActive === true
        ? currentEmploymentDateWhere({ personnelType: input.personnelType })
        : { personnelType: input.personnelType },
      ...(input.isActive === false ? { none: currentEmploymentDateWhere() } : {}),
    };
  } else if (input.isActive === true) {
    where.employments = { some: currentEmploymentDateWhere() };
  } else if (input.isActive === false) {
    where.employments = { none: currentEmploymentDateWhere() };
  }
  if (input.filterField === "gender" && input.filterValue) {
    if (input.filterValue === "男") where.gender = true;
    if (input.filterValue === "女") where.gender = false;
  }
  if (input.filterField === "education" && input.filterValue) {
    where.education = { contains: input.filterValue, mode: "insensitive" };
  }
  return where;
}

function attachEmployeeDirectoryFields<T extends { employments: Array<{ isActive: boolean; joinDate: string | null; leaveDate: string | null; currentCompany: string | null; contracts: string | null }>; positions: Array<{ position?: { name: string | null; department?: { name: string | null } | null } | null; department?: { name: string | null } | null }> }>(employees: T[]) {
  const today = workspaceBusinessDate(new Date());
  for (const employee of employees) {
    for (const employment of employee.employments) {
      employment.isActive = employmentIsActiveOnDate(employment, today);
    }
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
    select: { id: true, username: true, canLogin: true, employees: { select: { name: true }, take: 1 } },
  });
  const nameByUserId = new Map(users.map((user) => [user.id, user.employees[0]?.name || "未绑定员工"]));
  const accountByUserId = new Map(users.map((user) => [user.id, user]));
  for (const employee of employees) {
    if (!employee.userId) continue;
    (employee as Record<string, unknown>).userIdName = nameByUserId.get(employee.userId) ?? String(employee.userId);
    (employee as Record<string, unknown>).username = accountByUserId.get(employee.userId)?.username ?? null;
    (employee as Record<string, unknown>).accountCanLogin = accountByUserId.get(employee.userId)?.canLogin ?? false;
  }
}

export async function listEmployees(input: {
  employmentStatus?: "active" | "inactive";
  isActive?: string | null;
  company?: string;
  department?: string;
  position?: string;
  personnelType?: string;
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
  const diagnostics = startEmployeeListDiagnostics(input, canUseFastDirectoryQuery ? "fast" : "slow");
  logEmployeeListDiagnostics(diagnostics, "start");

  if (canUseFastDirectoryQuery) {
    const where = buildFastDirectoryWhere({
      isActive,
      personnelType: input.personnelType,
      filterField: input.filterField,
      filterValue: input.filterValue,
    });
    const [total, employees] = await Promise.all([
      prisma.employee.count({ where }),
      prisma.employee.findMany({
        where,
        include: {
          employments: {
            select: { isActive: true, joinDate: true, leaveDate: true, currentCompany: true, contracts: true, personnelType: true },
            orderBy: [{ isActive: "desc" }, { id: "desc" }],
          },
          positions: {
            where: currentOpenEndedDateWhere(),
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
        select: { isActive: true, joinDate: true, leaveDate: true, currentCompany: true, contracts: true, personnelType: true },
        orderBy: [{ isActive: "desc" }, { id: "desc" }],
      },
      positions: {
        where: currentOpenEndedDateWhere(),
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
  if (input.personnelType) {
    employees = employees.filter((employee) => employee.employments.some((employment) => (
      employment.personnelType === input.personnelType
      && (isActive === null || employment.isActive === isActive)
    )));
    logEmployeeListDiagnostics(diagnostics, "slow:filter-personnel-type", { rows: employees.length });
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

export async function updateEmployeePageDraft(input: {
  userId: number;
  changes: Array<{ id: number; field: string; value: unknown }>;
}) {
  const command = mapValidationToServiceResult(buildEmployeePageDraftCommand(input));
  if (!command.ok) return command;
  if (!(await checkHRUpdate(command.data.userId, "hr.roster"))) return serviceError("无 HR 编辑权限", 403);
  const direct = await assertBusinessActionDirectExecutionAllowed({
    businessActionKey: "hr.roster.employee.update",
    actorUserId: command.data.userId,
    resourceKey: "hr.roster",
    scopeType: "global",
    scopeId: null,
    blockedMessage: "员工更新已配置为必须走流程，请从统一保存入口提交",
  });
  if (!direct.ok) return direct;

  const ids = Array.from(new Set(command.data.changes.map((change) => change.id)));
  const rows = await prisma.employee.findMany({
    where: { id: { in: ids } },
    select: { id: true, employeeId: true, userId: true },
  });
  if (rows.length !== ids.length) return serviceError("部分员工不存在，请刷新后重试", 404);
  const changesById = new Map<number, Record<string, unknown>>();
  for (const change of command.data.changes) {
    changesById.set(change.id, { ...(changesById.get(change.id) ?? {}), [change.field]: change.value ?? null });
  }
  const nextEmployeeIds = rows.map((row) => String(changesById.get(row.id)?.employeeId ?? row.employeeId));
  if (new Set(nextEmployeeIds).size !== nextEmployeeIds.length) return serviceError("员工编号不能重复", 409);
  const conflictingEmployeeId = await prisma.employee.findFirst({
    where: { id: { notIn: ids }, employeeId: { in: nextEmployeeIds } },
    select: { id: true },
  });
  if (conflictingEmployeeId) return serviceError("员工编号已被使用", 409);
  const nextUserIds = rows
    .map((row) => changesById.get(row.id)?.userId ?? row.userId)
    .filter((value): value is number => typeof value === "number");
  if (new Set(nextUserIds).size !== nextUserIds.length) return serviceError("同一账号不能关联多名员工", 409);
  const [users, conflictingUser, usersClaimingEmployeeIds] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: nextUserIds } }, select: { id: true } }),
    prisma.employee.findFirst({ where: { id: { notIn: ids }, userId: { in: nextUserIds } }, select: { id: true } }),
    prisma.user.findMany({
      where: { employeeId: { in: nextEmployeeIds } },
      select: { id: true, employeeId: true },
    }),
  ]);
  if (users.length !== new Set(nextUserIds).size) return serviceError("关联账号不存在", 400);
  if (conflictingUser) return serviceError("关联账号已绑定其他员工", 409);
  const employeeIdOwnerConflict = usersClaimingEmployeeIds.some((user) => rows.some((row) => {
    const values = changesById.get(row.id) ?? {};
    const nextEmployeeId = String(values.employeeId ?? row.employeeId);
    const nextUserId = Object.hasOwn(values, "userId") ? values.userId as number | null : row.userId;
    return user.employeeId === nextEmployeeId && user.id !== nextUserId && user.id !== row.userId;
  }));
  if (employeeIdOwnerConflict) return serviceError("员工编号已被其他账号占用", 409);
  await prisma.$transaction(async (tx) => {
    for (const id of ids) {
      const original = rows.find((row) => row.id === id)!;
      const values = changesById.get(id) ?? {};
      const nextEmployeeId = String(values.employeeId ?? original.employeeId);
      const nextUserId = Object.hasOwn(values, "userId") ? values.userId as number | null : original.userId;
      await ensureEditHistoryBaseline("Employee", id, command.data.userId, tx);
      await tx.employee.update({
        where: { id },
        data: {
          ...values,
          editedBy: command.data.userId,
          editedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (original.userId && original.userId !== nextUserId) {
        await tx.user.updateMany({
          where: { id: original.userId, employeeId: original.employeeId },
          data: { employeeId: null },
        });
      }
      if (nextUserId) {
        await tx.user.update({ where: { id: nextUserId }, data: { employeeId: nextEmployeeId } });
      }
      await snapshotHistory("Employee", id, command.data.userId, tx);
    }
  });
  return serviceOk({ success: true, updatedCount: ids.length, changeCount: command.data.changes.length });
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
