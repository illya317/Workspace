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
    select: { isWorkListAdmin: true, canAccessHR: true },
  });

  if (!user?.canAccessHR && !user?.isWorkListAdmin) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "dept";
  const q = searchParams.get("q") || "";

  if (type === "dept") {
    const depts = await prisma.employee.findMany({
      where: q ? { dept1: { contains: q }, deleted: false } : { deleted: false },
      select: { dept1: true },
      distinct: ["dept1"],
    });
    const list = depts.map((d) => d.dept1).filter(Boolean) as string[];
    return NextResponse.json({ items: list });
  }

  if (type === "name") {
    const employees = await prisma.employee.findMany({
      where: q ? { name: { contains: q }, deleted: { not: true } } : { deleted: { not: true } },
      select: { name: true, alias: true, dept1: true, position: true },
      distinct: ["name"],
      take: 20,
    });
    return NextResponse.json({ items: employees });
  }

  return NextResponse.json({ items: [] });
}
