import { NextResponse } from "next/server";
import { authenticate, checkHRAccess, checkHRWrite, checkHRDelete } from "@workspace/platform/server/auth";
import { createCompany, deleteCompanyById, listCompanies, upsertCompany } from "@workspace/hr/server";

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
  return NextResponse.json(await listCompanies({ keyword, activeOnly, page, pageSize }));
}

export async function POST(request: Request) {
  return createCompany(request);
}

export async function PUT(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRWrite(payload.userId, "people.roster"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const result = await upsertCompany(await request.json(), payload.userId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result.data);
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
  const result = await deleteCompanyById(id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status || 400 });
  return NextResponse.json(result.data);
}
