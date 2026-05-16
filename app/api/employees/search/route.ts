import { NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { matchEmployee } from "@/lib/search";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const query = q.toLowerCase();

  // 获取所有在职员工（数据量小，内存匹配拼音）
  const allEmployees = await prisma.employee.findMany({
    where: { status: "在职", deleted: false },
    select: {
      id: true,
      employeeId: true,
      name: true,
      alias: true,
      dept1: true,
      position: true,
      user: { select: { id: true } },
    },
  });

  // 统一搜索：姓名/别名/工号/拼音首字母
  const matched = allEmployees.filter((e) => {
    if (!q) return false;
    return matchEmployee(e, q);
  });

  // 去重 + 限制20条
  const seen = new Set<number>();
  const deduped = matched.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  }).slice(0, 20);

  const items = deduped.map((e) => ({
    rowId: e.id,
    employeeId: e.employeeId,
    name: e.name,
    alias: e.alias || "",
    dept1: e.dept1 || "",
    position: e.position || "",
    userId: e.user?.id ?? null,
  }));

  return NextResponse.json({ items });
}
