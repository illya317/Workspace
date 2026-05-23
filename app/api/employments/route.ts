import { NextResponse } from "next/server";
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { matchEmployee } from "@/lib/search";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword") || "";

  const items = await prisma.employment.findMany({
    include: { employee: { select: { id: true, employeeId: true, name: true } } },
    orderBy: { id: "asc" },
  });

  const mapped = items.map((item: any) => ({
    id: item.id,
    employeeId: item.employeeId,
    employeeName: item.employee?.name || "",
    status: item.status,
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
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const body = await request.json();
  const { employeeId, status, currentCompany, joinDate, leaveDate, leaveReason, officeLocation, attendanceType, contracts } = body;

  if (!employeeId) return NextResponse.json({ error: "缺少员工ID" }, { status: 400 });

  const item = await prisma.employment.create({
    data: {
      employeeId: Number(employeeId),
      status: status || "在职",
      currentCompany: currentCompany || null,
      joinDate: joinDate || null,
      leaveDate: leaveDate || null,
      leaveReason: leaveReason || null,
      officeLocation: officeLocation || null,
      attendanceType: attendanceType || null,
      contracts: contracts || null,
      editedBy: payload.userId,
    },
  });
  return NextResponse.json({ item });
}
