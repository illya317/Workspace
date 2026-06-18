import { NextResponse } from "next/server";
import { authenticate, checkHRWrite } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { snapshotHistory } from "@/lib/history";
import { isValidCompanyName, isValidDateValue, validateContractOption } from "@/lib/hr-field-validation";
import { normalizeContractRecord } from "@/server/services/contracts";

interface Props {
  params: Promise<{ id: string }>;
}

const DATE_FIELDS = [
  "firstContractStartDate",
  "firstContractEndDate",
  "secondContractStartDate",
  "secondContractEndDate",
  "thirdContractStartDate",
  "thirdContractEndDate",
  "permanentContractDate",
  "confidentialityDate",
  "nonCompeteDate",
  "endDate",
];

const CONTRACT_FIELDS = [
  "company",
  "isPrimary",
  "insuranceStatus",
  "legalRelation",
  "contractType",
  "employmentForm",
  ...DATE_FIELDS,
] as const;

type ContractBodyRow = Record<string, unknown>;

function nullableString(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : Number.NaN;
}

async function normalizeRow(row: ContractBodyRow, fallbackEmploymentId: number) {
  const employmentId = nullableNumber(row.employmentId) ?? fallbackEmploymentId;
  if (Number.isNaN(employmentId)) return null;

  for (const field of DATE_FIELDS) {
    if (!isValidDateValue(row[field])) return null;
  }
  if (!(await isValidCompanyName(row.company))) return null;
  for (const field of ["legalRelation", "contractType", "employmentForm", "insuranceStatus"]) {
    if (!validateContractOption(field, row[field])) return null;
  }

  const contract: Record<string, unknown> = {};
  for (const field of CONTRACT_FIELDS) {
    if (field === "isPrimary") contract[field] = Boolean(row[field]);
    else contract[field] = nullableString(row[field]);
  }
  return { employmentId, contract: normalizeContractRecord(contract) };
}

export async function PUT(request: Request, { params }: Props) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRWrite(payload.userId, "people.roster"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const employeeId = Number(id);
  if (!Number.isInteger(employeeId) || employeeId <= 0) {
    return NextResponse.json({ error: "员工ID无效" }, { status: 400 });
  }

  const employments = await prisma.employment.findMany({
    where: { employeeId },
    orderBy: [{ isActive: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  if (employments.length === 0) return NextResponse.json({ error: "该员工无雇佣记录" }, { status: 404 });

  const body = (await request.json().catch(() => null)) as { rows?: ContractBodyRow[] } | null;
  if (!body || !Array.isArray(body.rows)) {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }

  const employmentIds = new Set(employments.map((row) => row.id));
  const fallbackEmploymentId = employments[0].id;
  const grouped = new Map<number, Record<string, unknown>[]>();
  let primarySeen = false;

  for (const row of body.rows) {
    const normalized = await normalizeRow(row, fallbackEmploymentId);
    if (!normalized) return NextResponse.json({ error: "合同记录校验失败" }, { status: 400 });
    if (!employmentIds.has(normalized.employmentId)) {
      return NextResponse.json({ error: "合同记录不属于该员工" }, { status: 400 });
    }
    if (normalized.contract.isPrimary === true) {
      if (primarySeen) normalized.contract.isPrimary = false;
      primarySeen = true;
    }
    const list = grouped.get(normalized.employmentId) ?? [];
    list.push(normalized.contract);
    grouped.set(normalized.employmentId, list);
  }

  await prisma.$transaction(async (tx) => {
    for (const employment of employments) {
      await tx.employment.update({
        where: { id: employment.id },
        data: {
          contracts: JSON.stringify(grouped.get(employment.id) ?? []),
          editedBy: payload.userId,
          editedAt: new Date(),
          version: { increment: 1 },
        },
      });
    }
  });

  await Promise.all(employments.map((employment) => snapshotHistory("Employment", employment.id, payload.userId)));
  return NextResponse.json({ success: true });
}
