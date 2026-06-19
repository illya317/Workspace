import { SEARCH_CONFIG } from "./autocomplete-config";
import { formatDepartmentCodePath, formatDepartmentPath } from "@workspace/hr/utils/department-path";
import { prisma } from "@workspace/platform/server/prisma";
import { getInitials } from "@workspace/core/search";

const MAX_RESULTS = 50;

function matchRecord(record: Record<string, unknown>, keyword: string, searchFields: string[]): boolean {
  const q = keyword.toLowerCase();
  for (const field of searchFields) {
    const val = String(record[field] || "").toLowerCase();
    if (val.includes(q)) return true;
  }
  const name = String(record.name || "");
  return name ? getInitials(name).includes(q) : false;
}

export async function searchHrAutocomplete(entity: string, keyword: string, activeOnly: boolean) {
  const config = SEARCH_CONFIG[entity];
  if (!config) return { status: "unsupported" as const };

  const model = prisma[config.model] as unknown as { findMany: (args: unknown) => Promise<Record<string, unknown>[]> };
  const isShort = keyword.length <= 3;

  if (entity === "employee" && activeOnly) {
    const where = {
      employments: { some: { isActive: true } },
      ...(keyword && !isShort ? { OR: [{ name: { contains: keyword } }, { employeeId: { contains: keyword } }] } : {}),
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
      where: keyword && !isShort ? { OR: [{ name: { contains: keyword } }, { code: { contains: keyword } }] } : {},
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
      name: formatDepartmentPath(department) || department.name,
      subtitle: department.code,
    }));
    const filtered = keyword ? mapped.filter((item) => matchRecord(item, keyword, ["name", "subtitle"])) : mapped;
    return { status: "ok" as const, items: filtered.slice(0, MAX_RESULTS) };
  }

  if (entity === "position") {
    const positions = await prisma.position.findMany({
      where: keyword && !isShort ? { OR: [{ name: { contains: keyword } }, { code: { contains: keyword } }] } : {},
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
      const departmentPath = formatDepartmentPath(position.department);
      const departmentCodePath = formatDepartmentCodePath(position.department);
      return {
        id: position.id,
        name: position.name,
        subtitle: [position.code, departmentCodePath].filter(Boolean).join(" · "),
        departmentId: position.departmentId,
        departmentPath,
      };
    });
    const filtered = keyword ? mapped.filter((item) => matchRecord(item, keyword, ["name", "subtitle"])) : mapped;
    return { status: "ok" as const, items: filtered.slice(0, MAX_RESULTS) };
  }

  const take = keyword && isShort ? 1000 : MAX_RESULTS;
  const where = keyword && !isShort ? { OR: config.searchFields.map((field) => ({ [field]: { contains: keyword } })) } : {};
  const items = await model.findMany({ where, select: config.select, take, orderBy: { id: "asc" } });
  const mapped = items.map((item) => ({
    id: item.id,
    name: item[config.labelField],
    subtitle: config.subtitleField ? item[config.subtitleField] : undefined,
  }));
  const filtered = keyword ? mapped.filter((item) => matchRecord(item, keyword, config.searchFields)) : mapped;
  return { status: "ok" as const, items: filtered.slice(0, MAX_RESULTS) };
}
