import { NextResponse } from "next/server";
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getInitials } from "@/lib/search";

// 通用拼音过滤：文本包含 + 拼音首字母
function matchPinyin(text: string, q: string): boolean {
  const lower = text.toLowerCase();
  if (lower.includes(q)) return true;
  if (getInitials(text).includes(q)) return true;
  return false;
}

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
  const q = (searchParams.get("q") || "").toLowerCase();

  if (type === "dept") {
    const depts = await prisma.department.findMany({
      select: { name: true },
      distinct: ["name"],
    });
    const list = depts
      .map((d) => d.name).filter(Boolean) as string[];
    const filtered = q
      ? list.filter((name) => matchPinyin(name, q))
      : list;
    return NextResponse.json({ items: filtered });
  }

  if (type === "position") {
    const positions = await prisma.position.findMany({
      select: { name: true },
      distinct: ["name"],
    });
    const list = positions
      .map((p) => p.name).filter(Boolean) as string[];
    const filtered = q
      ? list.filter((name) => matchPinyin(name, q))
      : list;
    return NextResponse.json({ items: filtered });
  }

  if (type === "name") {
    const employees = await prisma.employee.findMany({
      select: { name: true, alias: true },
      distinct: ["name"],
    });
    const filtered = q
      ? employees.filter((e) => matchPinyin(e.name, q) || (e.alias ? matchPinyin(e.alias, q) : false))
      : employees;
    return NextResponse.json({ items: filtered.slice(0, 20) });
  }

  return NextResponse.json({ items: [] });
}
