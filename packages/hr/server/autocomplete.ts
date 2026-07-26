import { SEARCH_CONFIG } from "./autocomplete-config";
import { formatDepartmentCodePath, formatDepartmentPath } from "@workspace/hr/utils/department-path";
import { prisma } from "@workspace/platform/server/prisma";
import { matchSearchFields } from "@workspace/platform/search";
import { currentEmploymentDateWhere } from "@workspace/platform/server/relation-registry";

const MAX_RESULTS = 50;

function matchRecord(record: Record<string, unknown>, keyword: string, searchFields: string[]): boolean {
  return matchSearchFields(record, keyword, [...searchFields, "name"]);
}

export async function searchHrAutocomplete(entity: string, keyword: string, activeOnly: boolean) {
  const config = SEARCH_CONFIG[entity];
  if (!config) return { status: "unsupported" as const };

  const model = prisma[config.model] as unknown as { findMany: (args: unknown) => Promise<Record<string, unknown>[]> };
  const isShort = keyword.length <= 3;

  if (entity === "employee" && activeOnly) {
    const where = {
      employments: { some: currentEmploymentDateWhere() },
      ...(keyword && !isShort ? { OR: [{ name: { contains: keyword, mode: "insensitive" as const } }, { employeeId: { contains: keyword, mode: "insensitive" as const } }] } : {}),
    };
    const employees = await prisma.employee.findMany({
      where,
      select: { id: true, name: true, employeeId: true },
      take: isShort ? 1000 : MAX_RESULTS,
      orderBy: { employeeId: "asc" },
    });
    const mapped = employees.map((employee) => ({
      id: employee.id,
      name: employee.name,
      subtitle: employee.employeeId,
    }));
    const filtered = keyword ? mapped.filter((item) => matchRecord(item, keyword, ["name", "subtitle"])) : mapped;
    return { status: "ok" as const, items: filtered.slice(0, MAX_RESULTS) };
  }

  if (entity === "department") {
    const departments = await prisma.department.findMany({
      where: {
        isArchived: false,
        ...(keyword && !isShort ? { OR: [{ name: { contains: keyword, mode: "insensitive" as const } }, { code: { contains: keyword, mode: "insensitive" as const } }] } : {}),
      },
      select: {
        id: true,
        code: true,
        name: true,
        parent: { select: { code: true, name: true, parent: { select: { code: true, name: true } } } },
      },
      take: isShort ? 1000 : MAX_RESULTS,
      orderBy: { id: "asc" },
    });
    const mapped = departments.map((department) => ({
      id: department.id,
      name: department.name,
      subtitle: department.code,
      departmentPath: department.name,
      searchPath: formatDepartmentPath(department) || department.name,
    }));
    const filtered = keyword ? mapped.filter((item) => matchRecord(item, keyword, ["name", "subtitle", "searchPath"])) : mapped;
    return { status: "ok" as const, items: filtered.map(({ searchPath: _searchPath, ...item }) => item).slice(0, MAX_RESULTS) };
  }

  if (entity === "position") {
    const positions = await prisma.position.findMany({
      where: {
        isArchived: false,
        OR: [
          { departmentId: null },
          { department: { isArchived: false } },
        ],
        ...(keyword && !isShort ? { AND: [{ OR: [{ name: { contains: keyword, mode: "insensitive" as const } }, { code: { contains: keyword, mode: "insensitive" as const } }] }] } : {}),
      },
      select: {
        id: true,
        code: true,
        name: true,
        departmentId: true,
        department: {
          select: {
            code: true,
            name: true,
            parent: { select: { code: true, name: true, parent: { select: { code: true, name: true } } } },
          },
        },
      },
      take: isShort ? 1000 : MAX_RESULTS,
      orderBy: { id: "asc" },
    });
    const mapped = positions.map((position) => {
      const searchPath = formatDepartmentPath(position.department);
      const departmentCodePath = formatDepartmentCodePath(position.department);
      return {
        id: position.id,
        name: position.name,
        subtitle: [position.code, departmentCodePath].filter(Boolean).join(" · "),
        departmentId: position.departmentId,
        departmentPath: position.department?.name ?? null,
        searchPath,
      };
    });
    const filtered = keyword ? mapped.filter((item) => matchRecord(item, keyword, ["name", "subtitle", "searchPath"])) : mapped;
    return { status: "ok" as const, items: filtered.map(({ searchPath: _searchPath, ...item }) => item).slice(0, MAX_RESULTS) };
  }

  if (entity === "user") {
    const users = await prisma.user.findMany({
      where: keyword && !isShort
        ? {
            OR: [
              { username: { contains: keyword, mode: "insensitive" } },
              { employees: { some: { name: { contains: keyword, mode: "insensitive" } } } },
              { employees: { some: { employeeId: { contains: keyword, mode: "insensitive" } } } },
            ],
          }
        : {},
      select: {
        id: true,
        username: true,
        employees: { select: { name: true, employeeId: true }, take: 1 },
      },
      take: isShort ? 1000 : MAX_RESULTS,
      orderBy: { id: "asc" },
    });
    const mapped = users.map((user) => {
      const employee = user.employees[0];
      return {
        id: user.id,
        name: employee?.name ?? "未绑定员工",
        subtitle: employee?.employeeId ?? user.username,
        searchText: [user.username, employee?.name, employee?.employeeId].filter(Boolean).join(" "),
      };
    });
    const filtered = keyword ? mapped.filter((item) => matchRecord(item, keyword, ["name", "subtitle", "searchText"])) : mapped;
    return { status: "ok" as const, items: filtered.slice(0, MAX_RESULTS) };
  }

  const take = keyword && isShort ? 1000 : MAX_RESULTS;
  const where = keyword && !isShort ? { OR: config.searchFields.map((field) => ({ [field]: { contains: keyword, mode: "insensitive" } })) } : {};
  const items = await model.findMany({ where, select: config.select, take, orderBy: { id: "asc" } });
  const mapped = items.map((item) => ({
    id: item.id,
    name: item[config.labelField],
    subtitle: config.subtitleField ? item[config.subtitleField] : undefined,
  }));
  const filtered = keyword ? mapped.filter((item) => matchRecord(item, keyword, config.searchFields)) : mapped;
  return { status: "ok" as const, items: filtered.slice(0, MAX_RESULTS) };
}
