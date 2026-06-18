import { handleCreate } from "@/lib/crud";
import { NextResponse } from "next/server";

const CONFIG = { entityType: "EDP", modelKey: "eDP" as const };
import { authenticate, checkHRAccess, checkHRWrite } from "@/lib/auth";
import { formatDepartmentPath } from "@/lib/hr-department-path";
import { prisma } from "@/lib/prisma";
import { EDPCreateSchema, parseJson } from "@/lib/schemas";
import { isValidDateValue, parseWorkPercent } from "@/lib/hr-field-validation";

const DATE_FIELDS = ["startDate", "endDate"];

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!(await checkHRAccess(payload.userId, "access", "people.roster"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(500, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));

  const employees = await prisma.employee.findMany({
    select: { id: true, employeeId: true, name: true },
    orderBy: { id: "asc" },
  });
  const employeeIds = employees.map((e) => e.id);
  const empMap = new Map(employees.map((e) => [e.id, e]));

  const eps = await prisma.eDP.findMany({
    where: { employeeId: { in: employeeIds } },
    include: {
      department: { include: { parent: { include: { parent: true } } } },
      position: true,
    },
    orderBy: [{ id: "asc" }],
  });

  let rows = eps.map((ep) => {
    const emp = empMap.get(ep.employeeId);
    return {
      id: ep.id,
      employeeId: ep.employeeId,
      employeeName: emp?.name || "",
      departmentId: ep.departmentId,
      departmentName: formatDepartmentPath(ep.department) || ep.department?.name || "",
      positionId: ep.positionId,
      positionName: ep.position?.name || "",
      isPrimary: ep.isPrimary,
      startDate: ep.startDate,
      endDate: ep.endDate,
      reportTo: ep.reportTo,
      workPercent: ep.workPercent,
    };
  });

  if (keyword) {
    const q = keyword.toLowerCase();
    rows = rows.filter((r) =>
      (r.employeeName || "").toLowerCase().includes(q) ||
      String(r.employeeId || "").toLowerCase().includes(q) ||
      (r.departmentName || "").toLowerCase().includes(q) ||
      (r.positionName || "").toLowerCase().includes(q)
    );
  }

  const total = rows.length;
  const start = (page - 1) * pageSize;
  const paged = rows.slice(start, start + pageSize);
  return NextResponse.json({ positions: paged, total });
}

export async function POST(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRWrite(payload.userId, "people.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const parsed = await parseJson(request, EDPCreateSchema);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  for (const field of DATE_FIELDS) {
    if (!isValidDateValue(parsed.data[field as keyof typeof parsed.data])) {
      return NextResponse.json({ error: "日期格式无效" }, { status: 400 });
    }
  }
  const workPercent = parseWorkPercent(parsed.data.workPercent);
  if (Number.isNaN(workPercent) || (workPercent !== null && (workPercent < 0 || workPercent > 1))) {
    return NextResponse.json({ error: "工作占比必须在 0 到 1 之间" }, { status: 400 });
  }
  return handleCreate(request, CONFIG, async () => {
    const positionId = parsed.data.positionId ?? null;
    const position = positionId
      ? await prisma.position.findUnique({ where: { id: positionId }, select: { departmentId: true } })
      : null;
    return { ...parsed.data, departmentId: position?.departmentId ?? null };
  });
}
