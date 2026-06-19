import { NextResponse } from "next/server";
import { authenticate, checkHRWrite, checkHRDelete } from "@workspace/platform/server/auth";
import { deleteContract, updateContractField } from "@workspace/hr/server";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRWrite(payload.userId, "people.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { id } = await params;
  const contractId = parseInt(id);

  const body = await request.json();
  const { field, value } = body;
  const result = await updateContractField(contractId, field, value, payload.userId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status || 400 });
  return NextResponse.json(result.data);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRDelete(payload.userId, "people.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { id } = await params;
  const contractId = parseInt(id);
  const result = await deleteContract(contractId, payload.userId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status || 400 });
  return NextResponse.json(result.data);
}
