import { NextResponse } from "next/server";
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { snapshotHistory } from "@/lib/history";

const ALLOWED = ["name", "type", "description", "endDate"];

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { id } = await params;
  const body = await request.json();

  // 兼容旧格式 {name, type, departmentIds, description}
  if (body.field === undefined) {
    const { name, type, departmentIds, description } = body;
    const project = await prisma.project.update({
      where: { id: parseInt(id) },
      data: {
        ...(name !== undefined && { name }),
        ...(type !== undefined && { type }),
        ...(description !== undefined && { description }),
        editedBy: payload.userId,
        editedAt: new Date(),
        version: { increment: 1 },
        ...(departmentIds !== undefined ? {
          departments: { deleteMany: {}, create: departmentIds.map((deptId: number) => ({ departmentId: deptId })) },
        } : {}),
      },
    });
    return NextResponse.json({ project });
  }

  // 新格式 {field, value}
  const { field, value } = body;
  if (!ALLOWED.includes(field)) return NextResponse.json({ error: "非法字段" }, { status: 400 });

  const old = await prisma.project.findUnique({ where: { id: parseInt(id) } });
  if (old) await snapshotHistory("project", String(id), old, payload.userId);

  const data: any = { [field]: value ?? null, editedBy: payload.userId, editedAt: new Date(), version: { increment: 1 } };
  if (field === "endDate" && value === "") data.endDate = null;

  await prisma.project.update({ where: { id: parseInt(id) }, data });
  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { id } = await params;
  await prisma.project.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ success: true });
}
