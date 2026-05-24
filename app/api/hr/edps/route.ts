import { handleCreate } from "@/lib/crud";
import { NextResponse } from "next/server";

const CONFIG = { entityType: "EDP", modelKey: "eDP" as const };
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { snapshotHistory } from "@/lib/history";
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
    orderBy: { id: "asc" },
  });
  const employeeIds = employees.map((e) => e.id);
  const empMap = new Map(employees.map((e) => [e.id, e]));

  const eps = await prisma.eDP.findMany({
    where: { employeeId: { in: employeeIds } },
    include: { department: true, position: true },
    orderBy: [{ id: "asc" }],
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
  return handleCreate(request, CONFIG, (body) => {
    const required = ["employeeId"];
    for (const f of required) if (!body[f]) return null;
    return body;
  });
}


