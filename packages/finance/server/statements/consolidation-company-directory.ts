import { prisma } from "@workspace/platform/server/prisma";

export async function loadConsolidationCompanyDirectory(companyCodes: string[]) {
  const companies = companyCodes.length > 0
    ? await prisma.company.findMany({
        where: { code: { in: companyCodes } },
        select: { id: true, code: true, party: { select: { name: true, fullName: true } } },
      })
    : [];
  const rows = companies.map(({ party, ...company }) => ({ ...company, ...party }));
  const byId = new Map(rows.map((company) => [company.id, company]));
  const byCode = new Map(rows.map((company) => [company.code, company]));
  return {
    find: (companyId: number | null | undefined, companyCode: string) => (
      (companyId ? byId.get(companyId) : undefined) ?? byCode.get(companyCode)
    ),
    displayName: (companyId: number | null | undefined, companyCode: string, fallback: string) => (
      (companyId ? byId.get(companyId) : undefined)?.name ?? byCode.get(companyCode)?.name ?? fallback
    ),
  };
}
