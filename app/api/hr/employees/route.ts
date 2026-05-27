import { NextResponse } from "next/server";
import { withHRAccess } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";
import { matchAnyField } from "@/lib/search-schema";
import { snapshotHistory } from "@/lib/history";
import { resolveFkValues, fkDisplay } from "@/lib/resolve-fk";
import { EmployeeCreateSchema, parseJson } from "@/lib/schemas";

export const GET = withHRAccess(async (request: Request, _user) => {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(500, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));

  let employees = await prisma.employee.findMany({ orderBy: { id: "asc" } });
  if (keyword) employees = employees.filter((e) => matchAnyField(e, keyword, "Employee"));

  const total = employees.length;
  const start = (page - 1) * pageSize;
  const paged = employees.slice(start, start + pageSize);

  // FK 显示名填充（关联账号等）
  const fkMap = await resolveFkValues(paged as unknown as Record<string, unknown>[]);
  for (const emp of paged) {
    (emp as Record<string, unknown>).userIdName = fkDisplay("userId", String(emp.userId ?? ""), fkMap);
  }

  return NextResponse.json({ employees: paged, total });
});

export const POST = withHRAccess(async (request: Request, user) => {
  const parsed = await parseJson(request, EmployeeCreateSchema);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { employeeId, name } = parsed.data;
  const existing = await prisma.employee.findUnique({ where: { employeeId } });
  if (existing) return NextResponse.json({ error: "员工编号已存在" }, { status: 400 });

  const created = await prisma.employee.create({ data: { employeeId, name } });
  await snapshotHistory("Employee", created.id, user.userId);

  return NextResponse.json({ success: true, employee: created });
});
