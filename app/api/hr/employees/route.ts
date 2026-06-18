import { NextResponse } from "next/server";
import { withHRAccess, withHRWrite } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";
import { matchAnyField } from "@/lib/search-schema";
import { resolveFkValues, fkDisplay } from "@/lib/resolve-fk";
import { createEmployeeWithAccount } from "@/server/services/hr/employee-create";

export const GET = withHRAccess(async (request: Request, _user) => {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(500, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));

  let employees = await prisma.employee.findMany({
    include: {
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
  if (keyword) employees = employees.filter((e) => matchAnyField(e, keyword, "Employee"));

  const total = employees.length;
  const start = (page - 1) * pageSize;
  const paged = employees.slice(start, start + pageSize);

  // FK 显示名填充（关联账号等）
  const fkMap = await resolveFkValues(paged as unknown as Record<string, unknown>[]);
  for (const emp of paged) {
    const primaryPosition = emp.positions[0];
    (emp as Record<string, unknown>).userIdName = fkDisplay("userId", String(emp.userId ?? ""), fkMap);
    (emp as Record<string, unknown>).positionName = primaryPosition?.position?.name ?? null;
    (emp as Record<string, unknown>).directDepartmentName =
      primaryPosition?.position?.department?.name ?? primaryPosition?.department?.name ?? null;
  }

  return NextResponse.json({ employees: paged, total });
});

export const POST = withHRWrite(async (request: Request, user) => {
  const body = await request.json().catch(() => null);
  const name = typeof body === "object" && body ? String((body as { name?: unknown }).name || "") : "";
  const result = await createEmployeeWithAccount(name, user.userId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ success: true, employee: result.employee, user: result.user });
});
