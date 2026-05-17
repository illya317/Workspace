import { NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { matchEmployee } from "@/lib/search";
import { FENGHUA_BIO_GROUP, resolveCompanyFilter } from "@/lib/company";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { isWorkListAdmin: true, canAccessHR: true },
  });

  if (!user?.canAccessHR && !user?.isWorkListAdmin) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const company = searchParams.get("company") || "";
  const keyword = searchParams.get("keyword") || "";
  const statusFilter = searchParams.get("status") || "在职";

  const targetCompany = company || "";

  const employeeWhere: any = {};
  if (statusFilter === "在职") {
    employeeWhere.status = "在职";
    employeeWhere.deleted = false;
  } else if (statusFilter === "离职") {
    employeeWhere.status = "离职";
  }

  const employees = await prisma.employee.findMany({
    where: employeeWhere,
    select: { id: true, employeeId: true, name: true, status: true },
    orderBy: { employeeId: "asc" },
  });

  const employeeIds = employees.map((e) => e.id);
  const empMap = new Map(employees.map((e) => [e.id, e]));

  const epWhere: any = { employeeId: { in: employeeIds } };
  if (targetCompany) {
    epWhere.companyCode = { in: resolveCompanyFilter(targetCompany) };
  }

  const eps = await prisma.employeePosition.findMany({
    where: epWhere,
    include: { department: true, position: true },
    orderBy: [{ employeeId: "asc" }, { sortOrder: "asc" }],
  });

  const rows = eps.map((ep) => {
    const emp = empMap.get(ep.employeeId);
    return {
      id: ep.id,
      employeeId: emp?.employeeId || "",
      name: emp?.name || "",
      company: ep.companyCode || "",
      center: ep.center || "",
      dept1: ep.department?.name || "",
      position: ep.position?.name || "",
      isPrimary: ep.isPrimary,
      sortOrder: ep.sortOrder,
      status: emp?.status || "",
    };
  });

  if (keyword) {
    const filtered = rows.filter((r) => matchEmployee(r, keyword));
    return NextResponse.json({ positions: filtered });
  }

  return NextResponse.json({ positions: rows });
}
