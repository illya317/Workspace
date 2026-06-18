import { NextResponse } from "next/server";
import { authenticate, checkHRWrite } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { snapshotHistory } from "@/lib/history";
import { isValidDateValue } from "@/lib/hr-field-validation";

interface Props {
  params: Promise<{ id: string }>;
}

type ProjectBodyRow = Record<string, unknown>;

interface NormalizedProjectRow {
  id: number | null;
  employeeId: number;
  projectId: number;
  role: string | null;
  startDate: string | null;
  endDate: string | null;
}

function nullableString(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : Number.NaN;
}

async function normalizeRow(row: ProjectBodyRow, employeeId: number): Promise<NormalizedProjectRow | null> {
  const id = nullableNumber(row.id);
  if (Number.isNaN(id)) return null;

  const projectId = nullableNumber(row.projectId);
  if (!projectId || Number.isNaN(projectId)) return null;
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return null;

  const startDate = nullableString(row.startDate);
  const endDate = nullableString(row.endDate);
  if (!isValidDateValue(startDate) || !isValidDateValue(endDate)) return null;

  return {
    id,
    employeeId,
    projectId,
    role: nullableString(row.role),
    startDate,
    endDate,
  };
}

export async function PUT(request: Request, { params }: Props) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRWrite(payload.userId, "people.roster"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const employeeId = Number(id);
  if (!Number.isInteger(employeeId) || employeeId <= 0) {
    return NextResponse.json({ error: "员工ID无效" }, { status: 400 });
  }

  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
  if (!employee) return NextResponse.json({ error: "员工不存在" }, { status: 404 });

  const body = (await request.json().catch(() => null)) as { rows?: ProjectBodyRow[] } | null;
  if (!body || !Array.isArray(body.rows)) {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }

  const normalizedRows: NormalizedProjectRow[] = [];
  const projectIds = new Set<number>();
  for (const row of body.rows) {
    const normalized = await normalizeRow(row, employeeId);
    if (!normalized) return NextResponse.json({ error: "项目记录校验失败" }, { status: 400 });
    if (projectIds.has(normalized.projectId)) {
      return NextResponse.json({ error: "同一员工不能重复关联同一项目" }, { status: 400 });
    }
    projectIds.add(normalized.projectId);
    normalizedRows.push(normalized);
  }

  const existingRows = await prisma.employeeProject.findMany({
    where: { employeeId },
    select: { id: true },
  });
  const existingIds = new Set(existingRows.map((row) => row.id));
  for (const row of normalizedRows) {
    if (row.id !== null && !existingIds.has(row.id)) {
      return NextResponse.json({ error: "项目记录不属于该员工" }, { status: 400 });
    }
  }

  const changedIds: number[] = [];
  const keptIds = new Set(normalizedRows.map((row) => row.id).filter((id): id is number => id !== null));
  const deletedIds = existingRows.map((row) => row.id).filter((rowId) => !keptIds.has(rowId));

  await Promise.all(deletedIds.map((rowId) => snapshotHistory("EmployeeProject", rowId, payload.userId)));
  await prisma.$transaction(async (tx) => {
    for (const rowId of deletedIds) {
      await tx.employeeProject.delete({ where: { id: rowId } });
    }
    for (const row of normalizedRows) {
      const { id: rowId, ...data } = row;
      if (rowId) {
        await tx.employeeProject.update({
          where: { id: rowId },
          data: { ...data, editedBy: payload.userId, editedAt: new Date(), version: { increment: 1 } },
        });
        changedIds.push(rowId);
      } else {
        const created = await tx.employeeProject.create({
          data: { ...data, editedBy: payload.userId },
          select: { id: true },
        });
        changedIds.push(created.id);
      }
    }
  });

  await Promise.all(changedIds.map((rowId) => snapshotHistory("EmployeeProject", rowId, payload.userId)));
  return NextResponse.json({ success: true, ids: changedIds, deletedIds });
}
