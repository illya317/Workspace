import { NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { isWorkListAdmin: true, canAccessHR: true },
  });

  if (!user?.canAccessHR && !user?.isWorkListAdmin) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const { field, value } = body as { field: string; value: string | null };

  // 校验字段名合法性（仅限 Employee 基础信息表字段）
  const allowedFields = [
    "employeeId", "name", "alias", "gender", "ethnicity", "hometown", "politics",
    "education", "title", "school", "major", "majorRelevant",
    "phone", "office1", "office2", "office3",
    "attendance1", "attendance2", "joinDate", "nature",
    "status", "leaveDate", "deleted", "deletedTime", "deletedBy",
  ];
  if (!allowedFields.includes(field)) {
    return NextResponse.json({ error: "非法字段" }, { status: 400 });
  }

  // 如果修改 employeeId，需要先记录旧值以便同步 User 表
  let oldEmployeeId: string | null = null;
  if (field === "employeeId") {
    const emp = await prisma.employee.findUnique({
      where: { id: parseInt(id) },
      select: { employeeId: true },
    });
    oldEmployeeId = emp?.employeeId ?? null;
  }

  // 快照旧数据到 EditHistory
  const oldData = await prisma.employee.findUnique({
    where: { id: parseInt(id) },
  });
  if (oldData) {
    const entityId = oldData.employeeId;
    const maxVer = await prisma.editHistory.findFirst({
      where: { entityType: "employee", entityId },
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

  // 同步更新 User 表的 employeeId（改一处，处处改）
  if (field === "employeeId" && oldEmployeeId && value) {
    await prisma.user.updateMany({
      where: { employeeId: oldEmployeeId },
      data: { employeeId: value },
    });
  }

  // 如果标记为离职，自动禁用关联用户的登录
  if (field === "status" && value === "离职") {
    const emp = await prisma.employee.findUnique({
      where: { id: parseInt(id) },
      select: { employeeId: true },
    });
    if (emp?.employeeId) {
      await prisma.user.updateMany({
        where: { employeeId: emp.employeeId },
        data: { canLogin: false },
      });
    }
  }

  return NextResponse.json({ success: true });
}
