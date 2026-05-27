import { NextResponse } from "next/server";
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { matchEmployee, getInitials } from "@/lib/search";

interface RawContract {
  company?: unknown;
  isPrimary?: unknown;
  isInsuredHere?: unknown;
  legalRelation?: unknown;
  contractType?: unknown;
  employmentForm?: unknown;
  firstContractStartDate?: unknown;
  firstContractEndDate?: unknown;
  secondContractStartDate?: unknown;
  secondContractEndDate?: unknown;
  thirdContractStartDate?: unknown;
  thirdContractEndDate?: unknown;
  permanentContractDate?: unknown;
  confidentialityDate?: unknown;
  nonCompeteDate?: unknown;
  endDate?: unknown;
}

interface ContractRow {
  id: number;
  employmentId: number;
  employeeId: string;
  employeeName: string;
  company: string;
  isPrimary: boolean;
  isInsuredHere: boolean;
  legalRelation: string;
  contractType: string;
  employmentForm: string;
  firstContractStartDate: string | null;
  firstContractEndDate: string | null;
  secondContractStartDate: string | null;
  secondContractEndDate: string | null;
  thirdContractStartDate: string | null;
  thirdContractEndDate: string | null;
  permanentContractDate: string | null;
  confidentialityDate: string | null;
  nonCompeteDate: string | null;
  endDate: string | null;
}

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const company = searchParams.get("company") || "";
  const keyword = searchParams.get("keyword") || "";

  const where: Prisma.EmploymentWhereInput = { isActive: true };
  if (company) where.currentCompany = company;

  const employments = await prisma.employment.findMany({
    where,
    include: {
      employee: { select: { id: true, employeeId: true, name: true } },
    },
    orderBy: { id: "asc" },
  });

  const contracts: ContractRow[] = [];
  for (const emp of employments) {
    if (!emp.contracts) continue;
    let list: Record<string, unknown>[] = [];
    try {
      const parsed = JSON.parse(emp.contracts) as unknown;
      if (Array.isArray(parsed)) {
        list = parsed as Record<string, unknown>[];
      } else {
        list = [parsed as Record<string, unknown>];
      }
    } catch {
      continue;
    }
    for (let i = 0; i < list.length; i++) {
      const c = list[i] as RawContract;
      contracts.push({
        id: emp.id * 1000 + i,
        employmentId: emp.id,
        employeeId: emp.employee?.employeeId || "",
        employeeName: emp.employee?.name || "",
        company: String(c.company || ""),
        isPrimary: Boolean(c.isPrimary ?? false),
        isInsuredHere: Boolean(c.isInsuredHere ?? false),
        legalRelation: String(c.legalRelation || ""),
        contractType: String(c.contractType || ""),
        employmentForm: String(c.employmentForm || ""),
        firstContractStartDate: c.firstContractStartDate == null ? null : String(c.firstContractStartDate),
        firstContractEndDate: c.firstContractEndDate == null ? null : String(c.firstContractEndDate),
        secondContractStartDate: c.secondContractStartDate == null ? null : String(c.secondContractStartDate),
        secondContractEndDate: c.secondContractEndDate == null ? null : String(c.secondContractEndDate),
        thirdContractStartDate: c.thirdContractStartDate == null ? null : String(c.thirdContractStartDate),
        thirdContractEndDate: c.thirdContractEndDate == null ? null : String(c.thirdContractEndDate),
        permanentContractDate: c.permanentContractDate == null ? null : String(c.permanentContractDate),
        confidentialityDate: c.confidentialityDate == null ? null : String(c.confidentialityDate),
        nonCompeteDate: c.nonCompeteDate == null ? null : String(c.nonCompeteDate),
        endDate: c.endDate == null ? null : String(c.endDate),
      });
    }
  }

  if (keyword) {
    const query = keyword.toLowerCase();
    const searchFields = [
      "company", "legalRelation", "contractType", "employmentForm",
    ];
    const filtered = contracts.filter((c) => {
      // employee info matching (name, pinyin initials, employeeId)
      if (matchEmployee({ name: c.employeeName, employeeId: c.employeeId }, keyword)) return true;
      // contract fields: includes + pinyin initials
      for (const f of searchFields) {
        const val = String((c as unknown as Record<string, unknown>)[f] || "").toLowerCase();
        if (val.includes(query)) return true;
        if (getInitials(String((c as unknown as Record<string, unknown>)[f] || "")).includes(query)) return true;
      }
      // date fields: simple includes
      const dateFields = [
        "firstContractStartDate", "firstContractEndDate",
        "secondContractStartDate", "secondContractEndDate",
        "thirdContractStartDate", "thirdContractEndDate",
        "permanentContractDate", "confidentialityDate",
        "nonCompeteDate", "endDate",
      ];
      for (const f of dateFields) {
        if ((String((c as unknown as Record<string, unknown>)[f] || "")).toLowerCase().includes(query)) return true;
      }
      return false;
    });
    return NextResponse.json({ contracts: filtered });
  }

  return NextResponse.json({ contracts });
}

export async function POST(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const body = (await request.json()) as Record<string, unknown>;
  const { employeeId, ...contractData } = body;

  const emp = await prisma.employment.findFirst({
    where: { employeeId: Number(employeeId) },
    orderBy: { id: "desc" },
  });
  if (!emp) return NextResponse.json({ error: "该员工无雇佣记录" }, { status: 404 });

  let rawContracts: Record<string, unknown>[] = [];
  if (emp.contracts) {
    try { rawContracts = JSON.parse(emp.contracts) as Record<string, unknown>[]; } catch { rawContracts = []; }
    if (!Array.isArray(rawContracts)) rawContracts = [rawContracts];
  }

  rawContracts.push(contractData);

  await prisma.employment.update({
    where: { id: emp.id },
    data: { contracts: JSON.stringify(rawContracts), editedBy: payload.userId, editedAt: new Date(), version: { increment: 1 } },
  });

  return NextResponse.json({ success: true });
}
