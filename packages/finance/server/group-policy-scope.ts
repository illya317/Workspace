import { prisma, type Prisma } from "@workspace/platform/server/prisma";

type GroupPolicyScopeClient = Pick<Prisma.TransactionClient, "company" | "ownershipInterest">;

type InternalOwnershipEdge = {
  childId: number;
  parentId: number;
};

/**
 * Resolves the top legal parent for a company-year policy scope.
 * This is a read-only consumer of the effective OwnershipInterest graph.
 */
export async function resolveFinanceGroupPolicyCompany(
  client: GroupPolicyScopeClient | typeof prisma,
  input: { companyCode: string; fiscalYear: number },
) {
  const company = await client.company.findUnique({
    where: { code: input.companyCode },
    select: { id: true, code: true, isActive: true, party: { select: { name: true } } },
  });
  if (!company?.isActive) throw new Error("当前公司不存在或已停用");
  const asOf = new Date(Date.UTC(input.fiscalYear, 11, 31, 23, 59, 59, 999));
  const relations = await client.ownershipInterest.findMany({
    where: {
      recordStatus: "confirmed",
      owner: { company: { isNot: null } },
      AND: [
        { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: asOf } }] },
        { OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }] },
      ],
    },
    select: {
      issuerCompanyId: true,
      owner: { select: { company: { select: { id: true } } } },
    },
  });
  const groupCompanyId = selectFinanceGroupPolicyCompanyId(company.id, relations.flatMap((relation) => (
    relation.owner.company ? [{ childId: relation.issuerCompanyId, parentId: relation.owner.company.id }] : []
  )));
  const groupCompany = groupCompanyId === company.id
    ? company
    : await client.company.findUnique({
        where: { id: groupCompanyId },
        select: { id: true, code: true, isActive: true, party: { select: { name: true } } },
      });
  if (!groupCompany?.isActive) throw new Error("集团母公司不存在或已停用");
  return { id: groupCompany.id, code: groupCompany.code, name: groupCompany.party.name };
}

export function selectFinanceGroupPolicyCompanyId(
  companyId: number,
  relations: readonly InternalOwnershipEdge[],
) {
  const parentsByChild = new Map<number, Set<number>>();
  for (const relation of relations) {
    const parents = parentsByChild.get(relation.childId) ?? new Set<number>();
    parents.add(relation.parentId);
    parentsByChild.set(relation.childId, parents);
  }
  const visited = new Set<number>();
  let current = companyId;
  while (true) {
    if (visited.has(current)) throw new Error("公司股权关系存在环路，无法确定集团政策母公司");
    visited.add(current);
    const parents = [...(parentsByChild.get(current) ?? [])];
    if (parents.length === 0) return current;
    if (parents.length > 1) throw new Error("公司存在多个有效内部直接母公司，无法确定集团政策来源");
    current = parents[0]!;
  }
}
