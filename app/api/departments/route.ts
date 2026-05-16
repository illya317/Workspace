import { NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { isWorkListAdmin: true },
  });

  if (!user?.isWorkListAdmin) {
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
