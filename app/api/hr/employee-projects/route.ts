import { NextResponse } from "next/server";
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { handleCreate } from "@/lib/crud";
import { isValidDateValue } from "@/lib/hr-field-validation";


const CONFIG = { entityType: "EmployeeProject", modelKey: "employeeProject" as const };
const DATE_FIELDS = ["startDate", "endDate"];

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId, "access", "people.roster")))
    return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const keyword = searchParams.get("keyword") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(500, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));

  const where = projectId ? { projectId: parseInt(projectId) } : {};

  const entries = await prisma.employeeProject.findMany({
    where,
    include: {
      employee: { select: { id: true, employeeId: true, name: true } },
      project: { select: { id: true, name: true } },
    },
    orderBy: { id: "asc" },
  });

  const mapped = entries.map((e) => ({
    id: e.id,
    employeeId: e.employeeId,
    employeeNumber: e.employee?.employeeId || "",
    employeeName: e.employee?.name || "",
    projectId: e.projectId,
    projectName: e.project?.name || "",
    role: e.role,
    startDate: e.startDate,
    endDate: e.endDate,
  }));

  let result = mapped;
  if (keyword) {
    const q = keyword.toLowerCase();
    result = mapped.filter((e) =>
      (e.employeeName || "").toLowerCase().includes(q) ||
      (e.projectName || "").toLowerCase().includes(q) ||
      (e.role || "").toLowerCase().includes(q)
    );
  }

  const total = result.length;
  const start = (page - 1) * pageSize;
  const paged = result.slice(start, start + pageSize);

  return NextResponse.json({ entries: paged, total });
}

export async function POST(request: Request) {
  return handleCreate(request, CONFIG, async (body) => {
    const { employeeId, projectId, role, startDate, endDate } = body;
    if (!employeeId || !projectId) return null;
    for (const field of DATE_FIELDS) if (!isValidDateValue(body[field])) return null;
    const employee = await prisma.employee.findUnique({ where: { employeeId: String(employeeId) }, select: { id: true } });
    if (!employee) return null;
    const projectNumber = Number(projectId);
    if (!Number.isInteger(projectNumber)) return null;
    const project = await prisma.project.findUnique({ where: { id: projectNumber }, select: { id: true } });
    if (!project) return null;
    return { employeeId: employee.id, projectId: projectNumber, role: role ? String(role) : null, startDate: startDate ? String(startDate) : null, endDate: endDate ? String(endDate) : null };
  });
}
