import { NextResponse } from "next/server";
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
  const { field, value } = body as { field: string; value: string | null };

  // 校验字段名合法性（仅限 Employee 基础信息表字段）
  const allowedFields = [
    "employeeId", "name", "alias", "gender", "ethnicity", "hometown", "politics",
    "education", "title", "school", "major",
    "phone", "joinDate", "nature",
    "status", "leaveDate", "deleted", "deletedTime", "deletedBy",
  ];
  if (!allowedFields.includes(field)) {
    return NextResponse.json({ error: "非法字段" }, { status: 400 });
  }

  // 快照旧数据到 EditHistory
  const oldData = await prisma.employee.findUnique({
    where: { id: parseInt(id) },
  });
  if (oldData) {
    const entityId = String(oldData.id);
    // Beijing time (UTC+8) day boundary
    const now = new Date();
    const bj = new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10); // Beijing date
    const beijingMidnight = new Date(`${bj}T00:00:00+08:00`);
    const maxVer = await prisma.editHistory.findFirst({
      where: { entityType: "employee", entityId, createdAt: { gte: beijingMidnight } },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const nextVersion = (maxVer?.version || 0) + 1;
    await prisma.editHistory.create({
      data: {
        entityType: "employee",
        entityId,
        version: nextVersion,
        dataJson: JSON.stringify(oldData),
        editedBy: payload.userId,
      },
    });
  }

  await prisma.employee.update({
    where: { id: parseInt(id) },
    data: { [field]: value, editedBy: payload.userId, editedAt: new Date(), version: { increment: 1 } },
  });

  // 如果标记为离职，自动禁用关联用户的登录
  if (field === "status" && value === "离职") {
    const emp = await prisma.employee.findUnique({
      where: { id: parseInt(id) },
      select: { employeeId: true, userId: true },
    });
    if (emp?.userId) {
      await prisma.user.update({
        where: { id: emp.userId },
        data: { canLogin: false },
      });
    }
  }

  return NextResponse.json({ success: true });
}
