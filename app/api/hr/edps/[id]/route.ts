import { handleDelete } from "@/lib/crud";
import { NextResponse } from "next/server";
import { authenticate, checkHRWrite } from "@/lib/auth";
import { snapshotHistory } from "@/lib/history";
import { prisma } from "@/lib/prisma";
import { parseWorkPercent, rejectInvalidDateField } from "@/lib/hr-field-validation";

const FIELDS = ["positionId","isPrimary","startDate","endDate","reportTo","workPercent"];
const DATE_FIELDS = ["startDate", "endDate"];

async function onBeforeUpdate(field: string, value: unknown) {
  if (field === "departmentId" || field === "dept1") {
    return { error: "部门由岗位自动确定，不能手动修改" };
  }
  const dateResult = rejectInvalidDateField(field, value, DATE_FIELDS);
  if (!dateResult) return null;
  if (field === "position") {
    const name = String(value || "");
    const pos = name ? await prisma.position.findFirst({ where: { name } }) : null;
    if (name && !pos) return null;
    return { field: "positionId", value: pos?.id ?? null };
  }
  if (field === "positionId" && typeof value === "string") {
    const pos = await prisma.position.findFirst({ where: { name: value } });
    if (value && !pos) return null;
    return { field, value: pos?.id ?? null };
  }
  if (field === "workPercent") {
    const parsed = parseWorkPercent(value);
    if (Number.isNaN(parsed) || (parsed !== null && (parsed < 0 || parsed > 1))) return null;
  }
  return { field, value };
}

const CONFIG = { entityType: "EDP", modelKey: "eDP" as const, allowedFields: FIELDS, onBeforeUpdate };

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRWrite(payload.userId, "people.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { id } = await params;
  const recordId = Number(id);
  if (!Number.isInteger(recordId) || recordId <= 0) return NextResponse.json({ error: "记录ID无效" }, { status: 400 });

  const body = await request.json();
  let { field, value } = body as { field: string; value: unknown };
  const result = await onBeforeUpdate(field, value);
  if (!result) return NextResponse.json({ error: "非法字段" }, { status: 400 });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  field = result.field;
  value = result.value;
  if (!FIELDS.includes(field)) return NextResponse.json({ error: "非法字段" }, { status: 400 });

  const data: Record<string, unknown> = {
    [field]: value ?? null,
    editedBy: payload.userId,
    editedAt: new Date(),
    version: { increment: 1 },
  };
  if (field === "positionId") {
    const positionId = value === null || value === undefined || value === "" ? null : Number(value);
    const position = positionId
      ? await prisma.position.findUnique({ where: { id: positionId }, select: { departmentId: true } })
      : null;
    data.departmentId = position?.departmentId ?? null;
  }

  await prisma.eDP.update({ where: { id: recordId }, data });
  await snapshotHistory("EDP", recordId, payload.userId);
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleDelete(request, params, CONFIG);
}
