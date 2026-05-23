import { NextResponse } from "next/server";
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";


export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  if (!(await checkHRAccess(payload.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "dept";
  const q = searchParams.get("q") || "";

  if (type === "dept") {
    const where: any = q ? { name: { contains: q } } : {};
    const depts = await prisma.department.findMany({
      where,
      select: { name: true },
      distinct: ["name"],
    });
    const list = depts.map((d) => d.name).filter(Boolean) as string[];
    return NextResponse.json({ items: list });
  }

  if (type === "position") {
    const where: any = q ? { name: { contains: q } } : {};
    const positions = await prisma.position.findMany({
      where,
      select: { name: true },
      distinct: ["name"],
    });
    const list = positions.map((p) => p.name).filter(Boolean) as string[];
    return NextResponse.json({ items: list });
  }

  if (type === "name") {
    const employees = await prisma.employee.findMany({
      where: q ? { name: { contains: q } } : {},
      select: { name: true, alias: true },
      distinct: ["name"],
      take: 20,
    });
    return NextResponse.json({ items: employees });
  }

  return NextResponse.json({ items: [] });
}
