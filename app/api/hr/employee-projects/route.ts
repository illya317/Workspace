import { NextResponse } from "next/server";
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { handleCreate } from "@/lib/crud";

const CONFIG = { entityType: "EmployeeProject", modelKey: "employeeProject" as const };

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
    orderBy: { id: "asc" },
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
  return handleCreate(request, CONFIG, async (body) => {
    const { employeeId, projectId, role, startDate, endDate } = body;
    if (!employeeId || !projectId) return null;
    const employee = await prisma.employee.findUnique({ where: { employeeId: String(employeeId) }, select: { id: true } });
    if (!employee) return null;
    return { employeeId: employee.id, projectId: Number(projectId), role: role ? String(role) : null, startDate: startDate ? String(startDate) : null, endDate: endDate ? String(endDate) : null };
  });
}
