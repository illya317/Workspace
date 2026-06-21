import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { snapshotHistory } from "@workspace/platform/server/history";
import { normalizeEmployeeOption, rejectInvalidDateField } from "./field-validation";
import { serializeHrMajorItems } from "@workspace/hr/constants/field-options";
import { normalizeHrSchoolValue } from "@workspace/hr/constants/school-options";
import { prisma } from "@workspace/platform/server/prisma";
import { fkDisplay, resolveFkValues } from "@workspace/platform/server/resolve-fk";
import { handleDelete, handleUpdateField } from "./hr-crud";
import { matchAnyField, matchEmployee } from "@workspace/platform/search";

const EMPLOYEE_ID_PATTERN = /^\d{5}$/;
const USERNAME_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
const EMPLOYEE_FIELDS = [
  "employeeId",
  "name",
  "alias",
  "gender",
  "birthDate",
  "ethnicity",
  "hometown",
  "politics",
  "education",
  "title",
  "school",
  "major",
  "phone",
  "workStartDate",
  "idNumber",
  "otherId",
  "userId",
];
const DATE_FIELDS = ["birthDate", "workStartDate"];
const EMPLOYEE_DIRECTORY_FILTER_FIELDS = new Set(["gender", "education", "positionName", "directDepartmentName"]);

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

function normalizeAliasUpdate(value: unknown) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  let rawTags: unknown[] = [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) rawTags = parsed;
  } catch {
    rawTags = text.split(/[,，、;；\n]+/);
  }
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of rawTags) {
    const tag = String(item).trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags.length > 0 ? JSON.stringify(tags) : null;
}

async function normalizeEmployeeFieldUpdate(field: string, value: unknown) {
  if (field === "employeeId") {
    return { error: "员工编号由系统生成，不能手动修改" };
  }
  const dateResult = rejectInvalidDateField(field, value, DATE_FIELDS);
  if (!dateResult) return null;
  if (field === "alias") {
    return { field, value: normalizeAliasUpdate(value) };
  }
  if (field === "major") {
    return { field, value: serializeHrMajorItems(value) };
  }
  if (field === "school") {
    const result = normalizeHrSchoolValue(value);
    if (!result.ok) return { error: result.error };
    return { field, value: result.value };
  }
  if (field === "gender") {
    if (value === "男" || value === true) return { field, value: true };
    if (value === "女" || value === false) return { field, value: false };
    return { field, value: null };
  }
  if (["ethnicity", "politics", "education", "title", "phone", "idNumber"].includes(field)) {
    return normalizeEmployeeOption(field, value);
  }
  return { field, value };
}

function getEmployeeDirectoryFilterValue(employee: Record<string, unknown>, field: string) {
  if (field === "gender") {
    if (employee.gender === true) return "男";
    if (employee.gender === false) return "女";
    return "";
  }
  return String(employee[field] ?? "");
}

export async function listEmployees(input: {
  employmentStatus?: "active" | "inactive";
  keyword: string;
  filterField?: string;
  filterValue?: string;
  page: number;
  pageSize: number;
}) {
  let employees = await prisma.employee.findMany({
    include: {
      employments: {
        select: { isActive: true },
        orderBy: [{ isActive: "desc" }, { id: "desc" }],
      },
      positions: {
        include: {
          department: true,
          position: { include: { department: true } },
        },
        orderBy: [{ isPrimary: "desc" }, { id: "asc" }],
      },
    },
    orderBy: { id: "asc" },
  });
  for (const employee of employees) {
    const primaryPosition = employee.positions[0];
    (employee as Record<string, unknown>).positionName = primaryPosition?.position?.name ?? null;
    (employee as Record<string, unknown>).directDepartmentName =
      primaryPosition?.position?.department?.name ?? primaryPosition?.department?.name ?? null;
  }
  if (input.employmentStatus) {
    employees = employees.filter((employee) => {
      const hasActiveEmployment = employee.employments.some((employment) => employment.isActive);
      return input.employmentStatus === "active" ? hasActiveEmployment : !hasActiveEmployment;
    });
  }
  if (input.keyword) employees = employees.filter((employee) => matchAnyField(employee, input.keyword, "Employee"));
  if (input.filterField && input.filterValue && EMPLOYEE_DIRECTORY_FILTER_FIELDS.has(input.filterField)) {
    const query = input.filterValue.trim().toLowerCase();
    employees = employees.filter((employee) => getEmployeeDirectoryFilterValue(employee as unknown as Record<string, unknown>, input.filterField!).toLowerCase().includes(query));
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
  const cleanName = name.trim();
  if (!cleanName) {
    return { ok: false as const, error: "姓名必填", status: 400 };
  }

  const employeeId = await nextEmployeeId();
  const username = await uniqueUsername();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const linkedUser = await tx.user.create({
        data: {
          name: cleanName,
          username,
          employeeId,
          canLogin: true,
        },
        select: { id: true, name: true, username: true, employeeId: true },
      });
      const employee = await tx.employee.create({
        data: {
          employeeId,
          name: cleanName,
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
    allowedFields: EMPLOYEE_FIELDS,
    onBeforeUpdate: normalizeEmployeeFieldUpdate,
  });
}

export async function deleteEmployee(request: Request, params: Promise<{ id: string }>) {
  return handleDelete(request, params, {
    entityType: "Employee",
    modelKey: "employee" as const,
    allowedFields: EMPLOYEE_FIELDS,
    onBeforeUpdate: normalizeEmployeeFieldUpdate,
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
