import { NextResponse } from "next/server";
import { authenticate, checkHRAccess, checkHRWrite, checkHRDelete } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { snapshotHistory } from "@/lib/history";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!(await checkHRAccess(payload.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const companies = await prisma.company.findMany({ orderBy: { sortOrder: "asc" } });
  return NextResponse.json({
    companies: companies.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      fullName: r.fullName,
      registeredCapital: r.registeredCapital,
      unifiedCode: r.unifiedCode,
      bankName: r.bankName,
      registeredAddress: r.registeredAddress,
      registeredDate: r.registeredDate,
      legalPerson: r.legalPerson,
      sortOrder: r.sortOrder,
    })),
  });
}

export async function POST(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRWrite(payload.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await request.json();
  const { code, name, fullName, registeredCapital, unifiedCode, bankName, registeredAddress, registeredDate, legalPerson, sortOrder } = body;
  if (!code || !name) return NextResponse.json({ error: "缺少 code/name" }, { status: 400 });

  const existing = await prisma.company.findFirst({ where: { code } });
  if (existing) return NextResponse.json({ error: "编码已存在" }, { status: 400 });

  await prisma.company.create({
    data: {
      code, name,
      fullName: fullName ?? null,
      registeredCapital: registeredCapital ?? null,
      unifiedCode: unifiedCode ?? null,
      bankName: bankName ?? null,
      registeredAddress: registeredAddress ?? null,
      registeredDate: registeredDate ?? null,
      legalPerson: legalPerson ?? null,
      sortOrder: sortOrder ?? 0,
    },
  });
  return NextResponse.json({ success: true });
}

export async function PUT(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRWrite(payload.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await request.json();
  const { id, code, name, fullName, registeredCapital, unifiedCode, bankName, registeredAddress, registeredDate, legalPerson, sortOrder } = body;
  if (!code || !name) return NextResponse.json({ error: "缺少 code/name" }, { status: 400 });

  const dataFields = { fullName: fullName ?? null, registeredCapital: registeredCapital ?? null, unifiedCode: unifiedCode ?? null, bankName: bankName ?? null, registeredAddress: registeredAddress ?? null, registeredDate: registeredDate ?? null, legalPerson: legalPerson ?? null, sortOrder: sortOrder ?? 0 };
  if (id) {
    const existing = await prisma.company.findFirst({ where: { code } });
    if (existing && existing.id !== id) return NextResponse.json({ error: "编码已存在" }, { status: 400 });
    await prisma.company.update({ where: { id }, data: { code, name, ...dataFields, editedBy: payload.userId, editedAt: new Date(), version: { increment: 1 } } });
    await snapshotHistory("Company", id, payload.userId);
  } else {
    const existing = await prisma.company.findFirst({ where: { code } });
    if (existing) return NextResponse.json({ error: "编码已存在" }, { status: 400 });
    await prisma.company.create({ data: { code, name, ...dataFields } });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRDelete(payload.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const idParam = searchParams.get("id");
  if (!idParam) return NextResponse.json({ error: "缺少id" }, { status: 400 });
  const id = parseInt(idParam);

  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) return NextResponse.json({ error: "公司不存在" }, { status: 404 });

  // 清理持股关系
  await prisma.companyRelation.deleteMany({ where: { OR: [{ parentId: id }, { childId: id }] } });
  await prisma.company.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
