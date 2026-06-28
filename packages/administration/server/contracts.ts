import { z } from "zod";
import {
  buildContainsWhere,
  buildFilterWhere,
} from "@workspace/platform/server/dal/pagination";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import {
  buildContractCreateCommand,
  buildContractDeleteCommand,
  buildContractUpdateCommand,
} from "./domain/administration-contract-validation";
import { failCommand, okCommand } from "@workspace/platform/server/domain-validation";

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

export function buildContractUpdateRouteCommand(input: { id: number; body: ContractUpdateInput }) {
  if (Object.keys(input.body).length === 0) return failCommand("无更新内容");
  return okCommand(input);
}

export interface ContractListFilters {
  q?: string;
  location?: string;
  category?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

function buildWhere(filters: ContractListFilters): Prisma.ContractWhereInput {
  const where = buildFilterWhere<Prisma.ContractWhereInput>(filters as Record<string, unknown>, [
    "location",
    "category",
    "status",
  ]);
  Object.assign(where, buildContainsWhere(filters.q, [
    "name",
    "partyA",
    "partyB",
    "content",
    "contractNo",
    "handler",
    "shareholder",
    "remark",
  ]));
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
  const command = buildContractCreateCommand(data);
  if (!command.ok) throw new Error(command.issue.message);
  return prisma.contract.create({ data: command.data.data as Prisma.ContractCreateInput });
}

export async function updateContract(id: number, data: ContractUpdateInput) {
  const command = buildContractUpdateCommand(id, data);
  if (!command.ok) throw new Error(command.issue.message);
  return prisma.contract.update({
    where: { id: command.data.id },
    data: { ...command.data.data, version: { increment: 1 } },
  });
}

export async function deleteContract(id: number) {
  const command = buildContractDeleteCommand(id);
  if (!command.ok) throw new Error(command.issue.message);
  return prisma.contract.delete({ where: { id: command.data.id } });
}
