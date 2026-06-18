import { NextResponse } from "next/server";
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDepartmentCodePath, formatDepartmentPath } from "@/lib/hr-department-path";
import { getInitials } from "@/lib/search";
import { SEARCH_CONFIG } from "@/lib/autocomplete-config";

function matchRecord(record: Record<string, unknown>, keyword: string, searchFields: string[]): boolean {
  const q = keyword.toLowerCase();
  for (const field of searchFields) {
    const val = String(record[field] || "").toLowerCase();
    if (val.includes(q)) return true;
  }
  const name = String(record.name || "");
  if (name) {
    const initials = getInitials(name);
    if (initials.includes(q)) return true;
  }
  return false;
}

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!(await checkHRAccess(payload.userId, "access", "people.roster"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const entity = searchParams.get("entity") || "";
  const keyword = searchParams.get("keyword") || "";
  const activeOnly = searchParams.get("active") === "1" || searchParams.get("activeOnly") === "1";

  const config = SEARCH_CONFIG[entity];
  if (!config) {
    return NextResponse.json({ error: "不支持的实体类型" }, { status: 400 });
  }

  const model = prisma[config.model] as unknown as { findMany: (args: unknown) => Promise<Record<string, unknown>[]> };
  const MAX_RESULTS = 50;
  const isShort = keyword.length <= 3;

  if (entity === "employee" && activeOnly) {
    const where = {
      employments: { some: { isActive: true } },
      ...(keyword && !isShort ? { OR: [{ name: { contains: keyword } }, { employeeId: { contains: keyword } }] } : {}),
    };
    const take = isShort ? 1000 : MAX_RESULTS;
    const employees = await prisma.employee.findMany({
      where,
      select: { id: true, name: true, employeeId: true },
      take,
      orderBy: { employeeId: "asc" },
    });
    const mapped = employees.map((employee) => ({
      id: employee.id,
      name: employee.name,
      subtitle: employee.employeeId,
    }));
    const filtered = keyword ? mapped.filter((item) => matchRecord(item, keyword, ["name", "subtitle"])) : mapped;
    return NextResponse.json({ items: filtered.slice(0, MAX_RESULTS) });
  }

  if (entity === "department") {
    const where = keyword && !isShort ? { OR: [{ name: { contains: keyword } }, { code: { contains: keyword } }] } : {};
    const take = isShort ? 1000 : MAX_RESULTS;
    const departments = await prisma.department.findMany({
      where,
      select: {
        id: true,
        code: true,
        name: true,
        parent: { select: { code: true, name: true, parent: { select: { code: true, name: true } } } },
      },
      take,
      orderBy: { id: "asc" },
    });
    const mapped = departments.map((department) => ({
      id: department.id,
      name: formatDepartmentPath(department) || department.name,
      subtitle: department.code,
    }));
    const filtered = keyword ? mapped.filter((item) => matchRecord(item, keyword, ["name", "subtitle"])) : mapped;
    return NextResponse.json({ items: filtered.slice(0, MAX_RESULTS) });
  }

  if (entity === "position") {
    const where = keyword && !isShort ? { OR: [{ name: { contains: keyword } }, { code: { contains: keyword } }] } : {};
    const take = isShort ? 1000 : MAX_RESULTS;
    const positions = await prisma.position.findMany({
      where,
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
      take,
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
    return NextResponse.json({ items: filtered.slice(0, MAX_RESULTS) });
  }

  if (keyword) {
    const where = isShort ? {} : { OR: config.searchFields.map((f) => ({ [f]: { contains: keyword } })) };
    const take = isShort ? 1000 : MAX_RESULTS;
    const items = await model.findMany({ where, select: config.select, take, orderBy: { id: "asc" } });
    const mapped = items.map((item) => ({
      id: item.id,
      name: item[config.labelField],
      subtitle: config.subtitleField ? item[config.subtitleField] : undefined,
    }));
    const filtered = mapped.filter((item) => matchRecord(item, keyword, config.searchFields));
    return NextResponse.json({ items: filtered });
  }

  const items = await model.findMany({
    select: config.select,
    take: MAX_RESULTS,
    orderBy: { id: "asc" },
  });
  const mapped = items.map((item) => ({
    id: item.id,
    name: item[config.labelField],
    subtitle: config.subtitleField ? item[config.subtitleField] : undefined,
  }));
  return NextResponse.json({ items: mapped });
}
