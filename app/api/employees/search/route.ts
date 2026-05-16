import { NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getInitials } from "@/lib/search";

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
    select: { id: true, employeeId: true, name: true, alias: true, dept1: true, position: true },
  });

  // 匹配逻辑：姓名/别名包含 或 拼音首字母包含
  const matched = allEmployees.filter((e) => {
    if (!q) return false;
    const nameMatch = e.name.toLowerCase().includes(query);
    const aliasMatch = (e.alias || "").toLowerCase().includes(query);
    const initials = getInitials(e.name);
    const pinyinMatch = initials.includes(query);
    return nameMatch || aliasMatch || pinyinMatch;
  });

  // 额外：按用户名搜索匹配的用户，反查其员工记录补充
  if (/^[a-z0-9]+$/.test(query)) {
    const usersByUsername = await prisma.user.findMany({
      where: { username: { contains: query } },
      select: { employeeId: true },
    });
    const extraIds = usersByUsername.map((u) => u.employeeId).filter(Boolean) as string[];
    for (const e of allEmployees) {
      if (extraIds.includes(e.employeeId) && !matched.some((m) => m.id === e.id)) {
        matched.push(e);
      }
    }
  }

  // 去重 + 限制20条
  const seen = new Set<number>();
  const deduped = matched.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  }).slice(0, 20);

  // 按 employeeId 获取关联的 userId
  const uniqueEmployeeIds = [...new Set(deduped.map((e) => e.employeeId))];
  const users = await prisma.user.findMany({
    where: { employeeId: { in: uniqueEmployeeIds } },
    select: { id: true, employeeId: true },
  });
  const userMap = new Map(users.map((u) => [u.employeeId, u.id]));

  const items = deduped.map((e) => ({
    rowId: e.id,
    employeeId: e.employeeId,
    name: e.name,
    alias: e.alias || "",
    dept1: e.dept1 || "",
    position: e.position || "",
    userId: userMap.get(e.employeeId) || null,
  }));

  return NextResponse.json({ items });
}
