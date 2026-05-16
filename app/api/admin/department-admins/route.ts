import { NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isWorkListAdmin: true },
  });
  return user?.isWorkListAdmin === true;
}

// GET - 获取所有部门及其管理员
export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await requireAdmin(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  // 从 Employee 表获取所有唯一的 dept1 + company
  const employees = await prisma.employee.findMany({
    where: { status: "在职" },
    select: { dept1: true, company: true },
  });
  const deptMap = new Map<string, { dept1: string; company: string }>();
  for (const e of employees) {
    if (!e.dept1) continue;
    const key = `${e.company || ""}|${e.dept1}`;
    if (!deptMap.has(key)) deptMap.set(key, { dept1: e.dept1, company: e.company || "" });
  }
  const departments = Array.from(deptMap.values()).sort((a, b) => {
    if (a.company !== b.company) return a.company.localeCompare(b.company);
    return a.dept1.localeCompare(b.dept1);
  });

  // 获取所有部门管理员
  const admins = await prisma.departmentAdmin.findMany({
    include: { user: { select: { id: true, name: true, username: true, employeeId: true } } },
  });

  return NextResponse.json({ departments, admins });
}

// PUT - 添加部门管理员
export async function PUT(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await requireAdmin(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const body = await request.json();
  const { dept1, company, userId } = body;
  if (!dept1 || !userId) return NextResponse.json({ error: "缺少参数" }, { status: 400 });

  const existing = await prisma.departmentAdmin.findUnique({
    where: { dept1_company_userId: { dept1, company: company || "", userId: parseInt(userId) } },
  });
  if (existing) return NextResponse.json({ error: "该用户已是此部门管理员" }, { status: 409 });

  await prisma.departmentAdmin.create({
    data: { dept1, company: company || "", userId: parseInt(userId) },
  });
  return NextResponse.json({ success: true });
}

// DELETE - 删除部门管理员
export async function DELETE(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await requireAdmin(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少id" }, { status: 400 });

  await prisma.departmentAdmin.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ success: true });
}
