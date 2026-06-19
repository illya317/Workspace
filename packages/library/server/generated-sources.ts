import { prisma } from "@workspace/platform/server/prisma";

export async function listEnabledGeneratedSources() {
  return prisma.libraryGeneratedSource.findMany({
    where: { enabled: true },
    orderBy: { name: "asc" },
    select: {
      key: true,
      name: true,
      outputCategory: true,
      defaultConfidentialityLevel: true,
      enabled: true,
    },
  });
}

export async function getGeneratedSourceForRun(key: string) {
  return prisma.libraryGeneratedSource.findUnique({
    where: { key },
    select: { enabled: true, defaultConfidentialityLevel: true, outputCategory: true },
  });
}
