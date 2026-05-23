import { NextResponse } from "next/server";
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { snapshotHistory } from "@/lib/history";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  if (!(await checkHRAccess(payload.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  let { field, value } = body as { field: string; value: unknown };

  // gender 前端传 string，后端转 boolean
  if (field === "gender") {
    if (value === "男" || value === true) value = true;
    else if (value === "女" || value === false) value = false;
    else value = null;
  }

  // 校验字段名合法性（仅限 Employee 基础信息表字段）
  const allowedFields = [
    "employeeId", "name", "alias", "gender", "birthDate", "ethnicity", "hometown", "politics",
    "education", "title", "school", "major",
    "phone", "workStartDate", "idNumber", "otherId", "userId",
  ];
  if (!allowedFields.includes(field)) {
    return NextResponse.json({ error: "非法字段" }, { status: 400 });
  }



  await prisma.employee.update({
    where: { id: parseInt(id) },
    data: { [field]: value, editedBy: payload.userId, editedAt: new Date(), version: { increment: 1 } },
  });
  await snapshotHistory("Employee", parseInt(id), payload.userId);

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
  await snapshotHistory("Employee", parseInt(id), payload.userId);
  await prisma.employee.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ success: true });
}
