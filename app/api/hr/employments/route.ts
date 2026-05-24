import { handleCreate } from "@/lib/crud";
import { NextResponse } from "next/server";

const CONFIG = { entityType: "Employment", modelKey: "employment" as const };
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { snapshotHistory } from "@/lib/history";
import { matchEmployee } from "@/lib/search";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword") || "";
  const isActive = searchParams.get("isActive");

  const where: any = {};
  if (isActive !== null && isActive !== "") {
    where.isActive = isActive === "true" ? true : isActive === "false" ? false : undefined;
  }

  const items = await prisma.employment.findMany({
    where,
    include: { employee: { select: { id: true, employeeId: true, name: true } } },
    orderBy: { id: "asc" },
  });

  const mapped = items.map((item: any) => ({
    id: item.id,
    employeeId: item.employeeId,
    employeeName: item.employee?.name || "",
    isActive: item.isActive,
    currentCompany: item.currentCompany,
    joinDate: item.joinDate,
    leaveDate: item.leaveDate,
    leaveReason: item.leaveReason,
    officeLocation: item.officeLocation,
    attendanceType: item.attendanceType,
    contracts: item.contracts,
  }));

  if (keyword) {
    return NextResponse.json({ items: mapped.filter((e: any) => matchEmployee(e, keyword) || e.employeeName?.includes(keyword)) });
  }
  return NextResponse.json({ items: mapped });
}

export async function POST(request: Request) {
  return handleCreate(request, CONFIG, (body) => {
    const required = ["employeeId"];
    for (const f of required) if (!body[f]) return null;
    return body;
  });
}


