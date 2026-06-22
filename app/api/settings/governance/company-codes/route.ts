import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, checkHRAccess, checkHRWrite, checkHRDelete } from "@workspace/platform/server/auth";
import { jsonServiceResponse, routeIdParamsSchema } from "@workspace/platform/server/api";
import { deleteCompanyByParams, listCompanies, upsertCompany } from "@workspace/hr/server";

const companyBodySchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
}).passthrough();

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!(await checkHRAccess(payload.userId, "access", "hr.roster"))) {
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
  if (!(await checkHRWrite(payload.userId, "hr.roster"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const parsedBody = companyBodySchema.safeParse(await request.json());
  if (!parsedBody.success) {
    return NextResponse.json({ error: "缺少 code/name" }, { status: 400 });
  }

  return jsonServiceResponse(await upsertCompany(parsedBody.data, payload.userId));
}

export async function PUT(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRWrite(payload.userId, "hr.roster"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const parsedBody = companyBodySchema.safeParse(await request.json());
  if (!parsedBody.success) {
    return NextResponse.json({ error: "缺少 code/name" }, { status: 400 });
  }

  return jsonServiceResponse(await upsertCompany(parsedBody.data, payload.userId));
}

export async function DELETE(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRDelete(payload.userId, "hr.roster"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const parsedQuery = routeIdParamsSchema.safeParse({ id: searchParams.get("id") });
  if (!parsedQuery.success) return NextResponse.json({ error: "缺少id" }, { status: 400 });

  return deleteCompanyByParams(request, Promise.resolve({ id: String(parsedQuery.data.id) }));
}
