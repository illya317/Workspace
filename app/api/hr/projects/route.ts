import { NextResponse } from "next/server";

import { authenticate, checkHRAccess, checkHRWrite } from "@/lib/auth";
import { snapshotHistory } from "@/lib/history";
import { prisma } from "@/lib/prisma";
import { matchAnyField } from "@/lib/search-schema";
import { isValidDateValue } from "@/lib/hr-field-validation";
import { ProjectCreateSchema, parseJson } from "@/lib/schemas";

function formatDate(value: Date | string | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function parseDate(value: string | null | undefined) {
  return value ? new Date(`${value}T00:00:00`) : null;
}

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId, "access", "people.roster")))
    return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(500, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));

  const projects = await prisma.project.findMany({
    orderBy: { id: "asc" },
    include: {
      _count: { select: { employees: true } },
    },
  });

  const mapped = projects.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    description: p.description,
    startDate: formatDate(p.startDate),
    endDate: formatDate(p.endDate),
    employeeCount: p._count.employees,
  }));

  let result = mapped;
  if (keyword) {
    result = mapped.filter((p) => matchAnyField(p, keyword, "Project"));
  }

  const total = result.length;
  const start = (page - 1) * pageSize;
  const paged = result.slice(start, start + pageSize);

  return NextResponse.json({ projects: paged, total });
}

export async function POST(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRWrite(payload.userId, "people.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const parsed = await parseJson(request, ProjectCreateSchema);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!isValidDateValue(parsed.data.startDate) || !isValidDateValue(parsed.data.endDate)) {
    return NextResponse.json({ error: "日期格式错误" }, { status: 400 });
  }
  const record = await prisma.project.create({
    data: {
      name: parsed.data.name,
      type: parsed.data.type || "project",
      description: parsed.data.description || null,
      startDate: parseDate(parsed.data.startDate),
      endDate: parseDate(parsed.data.endDate),
      editedBy: payload.userId,
    },
  });
  await snapshotHistory("Project", record.id, payload.userId);

  return NextResponse.json({ success: true, record });
}
