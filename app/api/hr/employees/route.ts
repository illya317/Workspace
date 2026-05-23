import { NextResponse } from "next/server";
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { matchEmployee } from "@/lib/search";
import { matchAnyField } from "@/lib/search-schema";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword") || "";

  let employees = await prisma.employee.findMany({ orderBy: { employeeId: "asc" } });
  if (keyword) employees = employees.filter((e) => matchAnyField(e, keyword, "Employee"));
  return NextResponse.json({ employees });
}
