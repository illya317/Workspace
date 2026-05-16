import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 丰华生物(001)/天力通(002)/悦通(003) 共享一套编码
const SHARED_GROUP = ["001", "002", "003"];

function normalizeCompanyCode(companyCode: string): string {
  if (SHARED_GROUP.includes(companyCode)) return "001";
  return companyCode;
}

export async function GET(request: Request) {
  const { error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });

  const { searchParams } = new URL(request.url);
  const companyCodesParam = searchParams.get("companyCodes");
  const companyCode = searchParams.get("companyCode");

  const codes = companyCodesParam
    ? companyCodesParam.split(",")
    : companyCode
      ? [companyCode]
      : [];

  const where: any = {};
  if (codes.length > 0) {
    where.OR = codes.flatMap((cc: string) => [
      { companyCode: cc },
      { code: { startsWith: cc } },
    ]);
  }

  const result = await prisma.positionCode.findMany({ where, orderBy: { code: "asc" } });
  return NextResponse.json({ codes: result });
}

export async function PUT(request: Request) {
  const { error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });

  const body = await request.json();
  const { code, name, companyCode } = body;
  if (!code || !name) return NextResponse.json({ error: "缺少参数" }, { status: 400 });

  const normalizedCC = companyCode ? normalizeCompanyCode(companyCode) : undefined;
  let finalCode = code;
  let finalCompanyCode = normalizedCC;
  if (code.length === 3 && normalizedCC) {
    finalCode = normalizedCC + code;
    finalCompanyCode = normalizedCC;
  } else if (code.length === 6 && !normalizedCC) {
    finalCompanyCode = code.substring(0, 3);
  }

  await prisma.positionCode.upsert({
    where: { code: finalCode },
    update: { name, companyCode: finalCompanyCode },
    create: { code: finalCode, name, companyCode: finalCompanyCode },
  });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const { error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  if (!code) return NextResponse.json({ error: "缺少code" }, { status: 400 });

  await prisma.positionCode.delete({ where: { code } });
  return NextResponse.json({ success: true });
}
