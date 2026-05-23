import { NextResponse } from "next/server";
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { matchEmployee } from "@/lib/search";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const company = searchParams.get("company") || "";
  const keyword = searchParams.get("keyword") || "";

  const where: any = {};
  if (company) where.currentCompany = company;

  const employments = await prisma.employment.findMany({
    where,
    include: {
      employee: { select: { id: true, employeeId: true, name: true } },
    },
    orderBy: { id: "asc" },
  });

  const contracts: any[] = [];
  for (const emp of employments) {
    if (!emp.contracts) continue;
    let list: any[] = [];
    try {
      list = JSON.parse(emp.contracts);
      if (!Array.isArray(list)) list = [list];
    } catch {
      continue;
    }
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      contracts.push({
        id: emp.id * 1000 + i,
        employmentId: emp.id,
        employeeId: emp.employee?.employeeId || "",
        employeeName: emp.employee?.name || "",
        company: c.company || "",
        isPrimary: c.isPrimary ?? false,
        isInsuredHere: c.isInsuredHere ?? false,
        legalRelation: c.legalRelation || "",
        contractType: c.contractType || "",
        employmentForm: c.employmentForm || "",
        firstContractStartDate: c.firstContractStartDate || null,
        firstContractEndDate: c.firstContractEndDate || null,
        secondContractStartDate: c.secondContractStartDate || null,
        secondContractEndDate: c.secondContractEndDate || null,
        thirdContractStartDate: c.thirdContractStartDate || null,
        thirdContractEndDate: c.thirdContractEndDate || null,
        permanentContractDate: c.permanentContractDate || null,
        confidentialityDate: c.confidentialityDate || null,
        nonCompeteDate: c.nonCompeteDate || null,
        endDate: c.endDate || null,
      });
    }
  }

  if (keyword) {
    const query = keyword.toLowerCase();
    const searchFields = [
      "employeeName", "employeeId", "company", "legalRelation",
      "contractType", "employmentForm",
      "firstContractStartDate", "firstContractEndDate",
      "secondContractStartDate", "secondContractEndDate",
      "thirdContractStartDate", "thirdContractEndDate",
      "permanentContractDate", "confidentialityDate",
      "nonCompeteDate", "endDate",
    ];
    const filtered = contracts.filter((c: any) =>
      searchFields.some((f) => (c[f] || "").toLowerCase().includes(query))
    );
    return NextResponse.json({ contracts: filtered });
  }

  return NextResponse.json({ contracts });
}

export async function POST(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const body = await request.json();
  const { employeeId, ...contractData } = body;

  const emp = await prisma.employment.findFirst({
    where: { employeeId: Number(employeeId) },
    orderBy: { id: "desc" },
  });
  if (!emp) return NextResponse.json({ error: "该员工无雇佣记录" }, { status: 404 });

  let contracts: any[] = [];
  if (emp.contracts) {
    try { contracts = JSON.parse(emp.contracts); } catch { contracts = []; }
    if (!Array.isArray(contracts)) contracts = [contracts];
  }

  contracts.push(contractData);

  await prisma.employment.update({
    where: { id: emp.id },
    data: { contracts: JSON.stringify(contracts), editedBy: payload.userId, editedAt: new Date(), version: { increment: 1 } },
  });

  return NextResponse.json({ success: true });
}
