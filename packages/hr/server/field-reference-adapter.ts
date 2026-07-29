import { prisma } from "@workspace/platform/server/prisma";

export async function companyNameExists(name: string) {
  return Boolean(await prisma.company.findFirst({
    where: { party: { name } },
    select: { id: true },
  }));
}
