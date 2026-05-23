import { NextResponse } from "next/server";
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { matchEmployee } from "@/lib/search";
import { matchAnyField } from "@/lib/search-schema";
import { FENGHUA_BIO_GROUP, resolveCompanyFilter } from "@/lib/company";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!(await checkHRAccess(payload.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const company = searchParams.get("company") || "";
  const keyword = searchParams.get("keyword") || "";

  const employees = await prisma.employee.findMany({
    select: { id: true, employeeId: true, name: true },
    orderBy: { employeeId: "asc" },
  });
  const employeeIds = employees.map((e) => e.id);
  const empMap = new Map(employees.map((e) => [e.id, e]));

  const eps = await prisma.eDP.findMany({
    where: { employeeId: { in: employeeIds } },
    include: { department: true, position: true },
    orderBy: [{ employeeId: "asc" }],
  });

  const rows = eps.map((ep) => {
    const emp = empMap.get(ep.employeeId);
    return {
      id: ep.id,
      employeeId: ep.employeeId,
      employeeName: emp?.name || "",
      departmentId: ep.departmentId,
      departmentName: ep.department?.name || "",
      positionId: ep.positionId,
      positionName: ep.position?.name || "",
      isPrimary: ep.isPrimary,
      startDate: ep.startDate,
      endDate: ep.endDate,
      personnelType: ep.personnelType,
      rank: ep.rank,
      title: ep.title,
      reportTo: ep.reportTo,
      reportTo2: ep.reportTo2,
      workPercent: ep.workPercent,
      isResearch: ep.isResearch,
    };
  });

  if (keyword) {
    const q = keyword.toLowerCase();
    const filtered = rows.filter((r: any) =>
      (r.employeeName || "").toLowerCase().includes(q) ||
      String(r.employeeId || "").toLowerCase().includes(q) ||
      (r.departmentName || "").toLowerCase().includes(q) ||
      (r.positionName || "").toLowerCase().includes(q)
    );
    return NextResponse.json({ positions: filtered });
  }

  return NextResponse.json({ positions: rows });
}

export async function POST(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const body = await request.json();
  const { employeeId, departmentId, positionId, isPrimary, startDate, endDate, personnelType, rank, title, reportTo, reportTo2, workPercent, isResearch } = body;

  if (!employeeId) return NextResponse.json({ error: "缺少员工ID" }, { status: 400 });

  const item = await prisma.eDP.create({
    data: {
      employeeId: Number(employeeId),
      departmentId: departmentId ? Number(departmentId) : null,
      positionId: positionId ? Number(positionId) : null,
      isPrimary: !!isPrimary,
      startDate: startDate || null,
      endDate: endDate || null,
      personnelType: personnelType || null,
      rank: rank || null,
      title: title || null,
      reportTo: reportTo || null,
      reportTo2: reportTo2 || null,
      workPercent: workPercent || null,
      isResearch: isResearch === true || isResearch === "是" ? true : (isResearch === false || isResearch === "否" ? false : null),
      editedBy: payload.userId,
    },
  });
  return NextResponse.json({ item });
}
