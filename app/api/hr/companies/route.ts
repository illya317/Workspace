import { handleCreate } from "@/lib/crud";
import { NextResponse } from "next/server";

const CONFIG = { entityType: "Company", modelKey: "company" as const };
import { authenticate, checkHRAccess, checkHRWrite, checkHRDelete } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { snapshotHistory } from "@/lib/history";
import { matchAnyField } from "@/lib/search-schema";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!(await checkHRAccess(payload.userId, "access", "people.roster"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword") || "";
  const activeOnly = searchParams.get("active") === "1";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(500, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));

  const where: { isActive?: boolean } = {};
  if (activeOnly) where.isActive = true;

  const companies = await prisma.company.findMany({ where, orderBy: { sortOrder: "asc" } });
  const mapped = companies.map((r) => ({
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
    managementGroup: r.managementGroup,
    codePoolCode: r.codePoolCode,
    isActive: r.isActive,
    sortOrder: r.sortOrder,
  }));

  let result = mapped;
  if (keyword) {
    result = mapped.filter((c) => matchAnyField(c, keyword, "Company"));
  }

  const total = result.length;
  const start = (page - 1) * pageSize;
  const paged = result.slice(start, start + pageSize);

  return NextResponse.json({ companies: paged, total });
}

export async function POST(request: Request) {
  return handleCreate(request, CONFIG, (body) => {
    const required = ["code","name"];
    for (const f of required) if (!body[f]) return null;
    return body;
  });
}

export async function PUT(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRWrite(payload.userId, "people.roster"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await request.json();
  const { id, code, name, fullName, registeredCapital, unifiedCode, bankName, registeredAddress, registeredDate, legalPerson, managementGroup, codePoolCode, isActive, sortOrder } = body;
  if (!code || !name) return NextResponse.json({ error: "缺少 code/name" }, { status: 400 });

  const dataFields = { fullName: fullName ?? null, registeredCapital: registeredCapital ?? null, unifiedCode: unifiedCode ?? null, bankName: bankName ?? null, registeredAddress: registeredAddress ?? null, registeredDate: registeredDate ?? null, legalPerson: legalPerson ?? null, managementGroup: managementGroup ?? "常规体系", codePoolCode: codePoolCode ?? null, isActive: typeof isActive === "boolean" ? isActive : true, sortOrder: typeof sortOrder === "number" ? sortOrder : 0 };
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
  if (!(await checkHRDelete(payload.userId, "people.roster"))) {
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
