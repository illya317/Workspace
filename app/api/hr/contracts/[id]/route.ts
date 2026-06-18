import { NextResponse } from "next/server";
import { authenticate, checkHRWrite, checkHRDelete } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidCompanyName, isValidDateValue, validateContractOption } from "@/lib/hr-field-validation";
import { snapshotHistory } from "@/lib/history";
import { clearPrimaryContractFlags, clearPrimaryContractsForEmployee, normalizeContractRecord } from "@/server/services/contracts";

const ALLOWED = [
  "company", "isPrimary", "isInsuredHere", "insuranceStatus", "legalRelation",
  "contractType", "employmentForm",
  "firstContractStartDate", "firstContractEndDate",
  "secondContractStartDate", "secondContractEndDate",
  "thirdContractStartDate", "thirdContractEndDate",
  "permanentContractDate", "confidentialityDate",
  "nonCompeteDate", "endDate",
];

const DATE_FIELDS = [
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
  if (!(await checkHRWrite(payload.userId, "people.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

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
  if (DATE_FIELDS.includes(field) && !isValidDateValue(value)) {
    return NextResponse.json({ error: "日期格式无效" }, { status: 400 });
  }
  if (field === "company" && !(await isValidCompanyName(value))) {
    return NextResponse.json({ error: "公司不存在" }, { status: 400 });
  }
  if (!validateContractOption(field, value)) {
    return NextResponse.json({ error: "字段值不在允许范围内" }, { status: 400 });
  }

  contracts[index][field] = value ?? null;
  contracts[index] = normalizeContractRecord(contracts[index]);
  if (field === "isPrimary" && value === true) {
    const result = clearPrimaryContractFlags(contracts, index);
    contracts = result.contracts.map(normalizeContractRecord);
    await clearPrimaryContractsForEmployee(emp.employeeId, payload.userId, employmentId);
  }

  await prisma.employment.update({
    where: { id: employmentId },
    data: { contracts: JSON.stringify(contracts), editedBy: payload.userId, editedAt: new Date(), version: { increment: 1 } },
  });
  await snapshotHistory("Employment", employmentId, payload.userId);

  return NextResponse.json({ success: true });
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
  await snapshotHistory("Employment", employmentId, payload.userId);

  return NextResponse.json({ success: true });
}
