import { z } from "zod";
import { Prisma, prisma } from "@workspace/platform/server/prisma";

export const ContractCreateSchema = z.object({
  name: z.string().min(1, "合同名称必填"),
  contractNo: z.string().optional().nullable(),
  partyA: z.string().optional().nullable(),
  partyB: z.string().optional().nullable(),
  shareholder: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  content: z.string().optional().nullable(),
  handler: z.string().optional().nullable(),
  signDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  amount: z.union([z.string(), z.number()]).optional().nullable(),
  executedAmount: z.union([z.string(), z.number()]).optional().nullable(),
  location: z.string().optional().nullable(),
  remark: z.string().optional().nullable(),
});

export const ContractUpdateSchema = ContractCreateSchema.partial();

export type ContractCreateInput = z.infer<typeof ContractCreateSchema>;
export type ContractUpdateInput = z.infer<typeof ContractUpdateSchema>;

export interface ContractListFilters {
  q?: string;
  location?: string;
  category?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

function toNullableAmount(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  return Number(value);
}

function contractData(data: ContractCreateInput | ContractUpdateInput) {
  return {
    ...(data.name !== undefined ? { name: data.name } : {}),
    ...(data.contractNo !== undefined ? { contractNo: data.contractNo ?? null } : {}),
    ...(data.partyA !== undefined ? { partyA: data.partyA ?? null } : {}),
    ...(data.partyB !== undefined ? { partyB: data.partyB ?? null } : {}),
    ...(data.shareholder !== undefined ? { shareholder: data.shareholder ?? null } : {}),
    ...(data.category !== undefined ? { category: data.category ?? null } : {}),
    ...(data.content !== undefined ? { content: data.content ?? null } : {}),
    ...(data.handler !== undefined ? { handler: data.handler ?? null } : {}),
    ...(data.signDate !== undefined ? { signDate: data.signDate ?? null } : {}),
    ...(data.endDate !== undefined ? { endDate: data.endDate ?? null } : {}),
    ...(data.status !== undefined ? { status: data.status ?? null } : {}),
    ...(data.amount !== undefined ? { amount: toNullableAmount(data.amount) } : {}),
    ...(data.executedAmount !== undefined ? { executedAmount: toNullableAmount(data.executedAmount) } : {}),
    ...(data.location !== undefined ? { location: data.location ?? null } : {}),
    ...(data.remark !== undefined ? { remark: data.remark ?? null } : {}),
  };
}

function buildWhere(filters: ContractListFilters): Prisma.ContractWhereInput {
  const where: Prisma.ContractWhereInput = {};
  const q = filters.q?.trim();
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
  if (filters.location) where.location = filters.location;
  if (filters.category) where.category = filters.category;
  if (filters.status) where.status = filters.status;
  return where;
}

export async function listContracts(filters: ContractListFilters) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 50;
  const where = buildWhere(filters);
  const skip = (page - 1) * pageSize;

  const [contracts, total, allLocations, allCategories, allStatuses] =
    await Promise.all([
      prisma.contract.findMany({ where, orderBy: { id: "desc" }, skip, take: pageSize }),
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

  return {
    contracts,
    total,
    page,
    pageSize,
    locations: allLocations.map((c) => c.location).filter((v): v is string => Boolean(v)),
    categories: allCategories.map((c) => c.category).filter((v): v is string => Boolean(v)),
    statuses: allStatuses.map((c) => c.status).filter((v): v is string => Boolean(v)),
  };
}

export async function createContract(data: ContractCreateInput) {
  return prisma.contract.create({ data: contractData(data) as Prisma.ContractCreateInput });
}

export async function updateContract(id: number, data: ContractUpdateInput) {
  return prisma.contract.update({
    where: { id },
    data: { ...contractData(data), version: { increment: 1 } },
  });
}

export async function deleteContract(id: number) {
  return prisma.contract.delete({ where: { id } });
}
