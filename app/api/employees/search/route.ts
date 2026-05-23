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

  // 获取所有在职员工，包含岗位信息
  const allEmployees = await prisma.employee.findMany({
    select: {
      id: true,
      employeeId: true,
      name: true,
      alias: true,
      user: { select: { id: true } },
      positions: {
        select: {
          department: { select: { name: true } },
          position: { select: { name: true } },
        },
      },
    },
  });

  // 统一搜索：姓名/别名/工号/拼音首字母
  const matched = allEmployees.filter((e) => {
    if (!q) return false;
    return matchEmployee(e, q);
  });

  // 一人多岗展开为多条记录，去重后限制20条
  const items: Array<{
    rowId: number;
    employeeId: string;
    name: string;
    alias: string;
    dept1: string;
    position: string;
    userId: number | null;
  }> = [];
  const seen = new Set<string>();

  for (const e of matched) {
    if (e.positions.length === 0) {
      const key = `${e.id}||`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        rowId: e.id,
        employeeId: e.employeeId,
        name: e.name,
        alias: e.alias || "",
        dept1: "",
        position: "",
        userId: e.user?.id ?? null,
      });
    } else {
      for (const pos of e.positions) {
        const deptName = pos.department?.name || "";
        const posName = pos.position?.name || "";
        const key = `${e.id}|${deptName}|${posName}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({
          rowId: e.id,
          employeeId: e.employeeId,
          name: e.name,
          alias: e.alias || "",
          dept1: deptName,
          position: posName,
          userId: e.user?.id ?? null,
        });
      }
    }
    if (items.length >= 20) break;
  }

  return NextResponse.json({ items });
}
