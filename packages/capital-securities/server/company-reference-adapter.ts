import { prisma } from "@workspace/platform/server/prisma";

export async function findCompanyIdByCode(code: string, excludedId?: number) {
  return prisma.company.findFirst({
    where: { code, ...(excludedId ? { id: { not: excludedId } } : {}) },
    select: { id: true },
  });
}

export async function findCompanyGovernanceReference(id: number) {
  return prisma.company.findUnique({
    where: { id },
    select: { id: true, party: { select: { fullName: true, legalRepresentative: true } } },
  });
}
