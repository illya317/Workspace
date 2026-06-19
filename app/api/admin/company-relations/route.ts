import { NextResponse } from "next/server";
import { authenticate, checkHRAccess, checkHRWrite } from "@workspace/platform/server/auth";
import { createCompanyRelation, listCompanyRelations } from "@workspace/hr/server";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId, "access", "people.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { relations } = await listCompanyRelations({ keyword: "", page: 1, pageSize: 500 });
  return NextResponse.json({
    relations,
  });
}

export async function POST(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRWrite(payload.userId, "people.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  return createCompanyRelation(request);
}
