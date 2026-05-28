import { NextResponse } from "next/server";
import { withContractAccess } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { ContractCreateSchema, parseJson } from "@/lib/schemas";

export const GET = withContractAccess(async (request) => {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const location = searchParams.get("location")?.trim();
  const category = searchParams.get("category")?.trim();
  const status = searchParams.get("status")?.trim();
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "50");

  const where: Prisma.ContractWhereInput = {};
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { partyA: { contains: q } },
      { partyB: { contains: q } },
      { content: { contains: q } },
      { contractNo: { contains: q } },
      { handler: { contains: q } },
      { shareholder: { contains: q } },
      { remark: { contains: q } },
    ];
  }
  if (location) where.location = location;
  if (category) where.category = category;
  if (status) where.status = status;

  const skip = (page - 1) * pageSize;

  const [contracts, total, allLocations, allCategories, allStatuses] =
    await Promise.all([
      prisma.contract.findMany({
        where,
        orderBy: { id: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.contract.count({ where }),
      prisma.contract.findMany({
        select: { location: true },
        distinct: ["location"],
        where: { location: { not: null } },
      }),
      prisma.contract.findMany({
        select: { category: true },
        distinct: ["category"],
        where: { category: { not: null } },
      }),
      prisma.contract.findMany({
        select: { status: true },
        distinct: ["status"],
        where: { status: { not: null } },
      }),
    ]);

  return NextResponse.json({
    contracts,
    total,
    page,
    pageSize,
    locations: allLocations
      .map((c) => c.location)
      .filter((v): v is string => !!v),
    categories: allCategories
      .map((c) => c.category)
      .filter((v): v is string => !!v),
    statuses: allStatuses.map((c) => c.status).filter((v): v is string => !!v),
  });
});

export const POST = withContractAccess(async (request) => {
  const parsed = await parseJson(request, ContractCreateSchema);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const data = parsed.data;

  const record = await prisma.contract.create({
    data: {
      name: data.name,
      contractNo: data.contractNo ?? null,
      partyA: data.partyA ?? null,
      partyB: data.partyB ?? null,
      shareholder: data.shareholder ?? null,
      category: data.category ?? null,
      content: data.content ?? null,
      handler: data.handler ?? null,
      signDate: data.signDate ?? null,
      endDate: data.endDate ?? null,
      status: data.status ?? null,
      amount: data.amount != null ? Number(data.amount) : null,
      executedAmount: data.executedAmount != null ? Number(data.executedAmount) : null,
      location: data.location ?? null,
      remark: data.remark ?? null,
    },
  });

  return NextResponse.json({ success: true, record });
});
