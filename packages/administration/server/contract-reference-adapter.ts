import { prisma } from "@workspace/platform/server/prisma";

export async function findActiveContractCategoryId(id: number) {
  const category = await prisma.contractCategory.findFirst({
    where: { id, isActive: true },
    select: { id: true },
  });
  return category?.id ?? null;
}
