import { NextResponse } from "next/server";
import { authenticate, checkHRAccess, checkHRWrite, checkHRDelete } from "@workspace/platform/server/auth";
import { deleteCompanyById, listCompanies, upsertCompany } from "@workspace/hr/server";

function serviceResponse<T>(result: { ok: true; data: T } | { ok: false; error: string; status?: number }) {
  if (result.ok) return NextResponse.json(result.data);
  return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
}

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!(await checkHRAccess(payload.userId, "access", "people.roster"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { companies } = await listCompanies({ keyword: "", activeOnly: false, page: 1, pageSize: 500 });
  return NextResponse.json({
    companies: companies.map((company) => ({
      id: company.id,
      code: company.code,
      name: company.name,
      fullName: company.fullName,
      registeredCapital: company.registeredCapital,
      unifiedCode: company.unifiedCode,
      bankName: company.bankName,
      registeredAddress: company.registeredAddress,
      registeredDate: company.registeredDate,
      legalPerson: company.legalPerson,
      sortOrder: company.sortOrder,
    })),
  });
}

export async function POST(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRWrite(payload.userId, "people.roster"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await request.json();
  return serviceResponse(await upsertCompany(body, payload.userId));
}

export async function PUT(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRWrite(payload.userId, "people.roster"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await request.json();
  return serviceResponse(await upsertCompany(body, payload.userId));
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
  return serviceResponse(await deleteCompanyById(id));
}
