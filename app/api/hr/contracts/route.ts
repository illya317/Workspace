import { NextResponse } from "next/server";
import { authenticate, checkHRAccess, checkHRWrite } from "@/lib/auth";
import { getContracts, addContract } from "@/server/services/contracts";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const company = searchParams.get("company") || undefined;
  const keyword = searchParams.get("keyword") || undefined;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(500, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));

  const result = await getContracts({ company, keyword, page, pageSize });
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRWrite(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const body = (await request.json()) as Record<string, unknown>;
  const { employeeId, ...contractData } = body;

  const result = await addContract(employeeId, contractData, payload.userId);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status || 400 }
    );
  }

  return NextResponse.json({ success: true });
}
