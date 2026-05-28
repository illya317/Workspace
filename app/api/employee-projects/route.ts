import { NextResponse } from "next/server";
import { authenticate, checkHRAccess, checkHRWrite } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId)))
    return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const where = projectId ? { projectId: parseInt(projectId) } : {};

  const entries = await prisma.employeeProject.findMany({
    where,
    include: {
      employee: { select: { id: true, employeeId: true, name: true } },
      project: { select: { id: true, name: true } },
    },
    orderBy: { id: "desc" },
  });
  return NextResponse.json({
    entries: entries.map((e) => ({
      id: e.id,
      employeeId: e.employeeId,
      employeeName: e.employee?.name || "",
      projectId: e.projectId,
      projectName: e.project?.name || "",
      role: e.role,
      startDate: e.startDate,
      endDate: e.endDate,
    })),
  });
}

export async function POST(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRWrite(payload.userId)))
    return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { employeeId, projectId, role, startDate, endDate } = await request.json();
  if (!employeeId || !projectId)
    return NextResponse.json({ error: "缺少employeeId或projectId" }, { status: 400 });

  const employee = await prisma.employee.findUnique({
    where: { employeeId },
    select: { id: true },
  });
  if (!employee) return NextResponse.json({ error: "员工不存在" }, { status: 404 });

  const entry = await prisma.employeeProject.create({
    data: {
      employeeId: employee.id,
      projectId,
      role: role || null,
      startDate: startDate || null,
      endDate: endDate || null,
      editedBy: payload.userId,
    },
  });
  return NextResponse.json({ entry });
}
