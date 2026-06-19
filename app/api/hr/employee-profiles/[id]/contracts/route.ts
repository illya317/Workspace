import { NextResponse } from "next/server";
import { authenticate, checkHRWrite } from "@workspace/platform/server/auth";
import { updateEmployeeProfileContracts } from "@workspace/hr/server";

interface Props {
  params: Promise<{ id: string }>;
}

function serviceResponse<T>(result: { ok: true; data: T } | { ok: false; error: string; status?: number }) {
  if (result.ok) return NextResponse.json(result.data);
  return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
}

export async function PUT(request: Request, { params }: Props) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRWrite(payload.userId, "people.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { rows?: unknown } | null;
  return serviceResponse(await updateEmployeeProfileContracts(Number(id), body?.rows, payload.userId));
}
