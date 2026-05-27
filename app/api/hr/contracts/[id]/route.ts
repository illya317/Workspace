import { NextResponse } from "next/server";
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ALLOWED = [
  "company", "isPrimary", "isInsuredHere", "legalRelation",
  "contractType", "employmentForm",
  "firstContractStartDate", "firstContractEndDate",
  "secondContractStartDate", "secondContractEndDate",
  "thirdContractStartDate", "thirdContractEndDate",
  "permanentContractDate", "confidentialityDate",
  "nonCompeteDate", "endDate",
];

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { id } = await params;
  const contractId = parseInt(id);
  const employmentId = Math.floor(contractId / 1000);
  const index = contractId % 1000;

  const emp = await prisma.employment.findUnique({ where: { id: employmentId } });
  if (!emp || !emp.contracts) return NextResponse.json({ error: "合同不存在" }, { status: 404 });

  let contracts: Record<string, unknown>[];
  try { contracts = JSON.parse(emp.contracts); } catch { return NextResponse.json({ error: "合同数据异常" }, { status: 500 }); }
  if (!Array.isArray(contracts) || index >= contracts.length) return NextResponse.json({ error: "合同不存在" }, { status: 404 });

  const body = await request.json();
  const { field, value } = body;

  if (!ALLOWED.includes(field)) return NextResponse.json({ error: "非法字段" }, { status: 400 });

  contracts[index][field] = value ?? null;

  await prisma.employment.update({
    where: { id: employmentId },
    data: { contracts: JSON.stringify(contracts), editedBy: payload.userId, editedAt: new Date(), version: { increment: 1 } },
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { id } = await params;
  const contractId = parseInt(id);
  const employmentId = Math.floor(contractId / 1000);
  const index = contractId % 1000;

  const emp = await prisma.employment.findUnique({ where: { id: employmentId } });
  if (!emp || !emp.contracts) return NextResponse.json({ error: "合同不存在" }, { status: 404 });

  let contracts: Record<string, unknown>[];
  try { contracts = JSON.parse(emp.contracts); } catch { return NextResponse.json({ error: "合同数据异常" }, { status: 500 }); }
  if (!Array.isArray(contracts) || index >= contracts.length) return NextResponse.json({ error: "合同不存在" }, { status: 404 });

  contracts.splice(index, 1);

  await prisma.employment.update({
    where: { id: employmentId },
    data: { contracts: JSON.stringify(contracts), editedBy: payload.userId, editedAt: new Date(), version: { increment: 1 } },
  });

  return NextResponse.json({ success: true });
}
