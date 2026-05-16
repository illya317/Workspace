import { NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) || 1;
}

async function requireAdmin(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isWorkListAdmin: true },
  });
  return user?.isWorkListAdmin === true;
}

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  if (!(await requireAdmin(payload.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const depts = await prisma.user.groupBy({
    by: ["departmentId", "departmentName", "company"],
    _count: { id: true },
    orderBy: { departmentId: "asc" },
  });

  return NextResponse.json({
    departments: depts
      .filter((d) => d.departmentName !== "管理员" && d.departmentName !== "其他")
      .map((d) => ({
        id: d.departmentId,
        name: d.departmentName || "未命名部门",
        company: d.company || "",
        count: d._count.id,
      })),
  });
}

export async function DELETE(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  if (!(await requireAdmin(payload.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await request.json();
  const { departmentId } = body;

  if (!departmentId) {
    return NextResponse.json({ error: "缺少 departmentId" }, { status: 400 });
  }

  const usersInDept = await prisma.user.findMany({
    where: { departmentId },
    select: { id: true, company: true },
  });

  if (usersInDept.length === 0) {
    return NextResponse.json({ error: "部门不存在" }, { status: 404 });
  }

  const company = usersInDept[0].company || "";
  const newDeptName = "其他";
  const newDeptId = hashString(`${company}-${newDeptName}`);

  await prisma.user.updateMany({
    where: { departmentId },
    data: {
      departmentName: newDeptName,
      departmentId: newDeptId,
    },
  });

  return NextResponse.json({
    success: true,
    message: `已将 ${usersInDept.length} 人移至"其他"部门`,
  });
}
