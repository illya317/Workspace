import { prisma } from "@workspace/platform/server/prisma";
import { getGenerator } from "./generators/registry";

export async function listEnabledGeneratedSources() {
  const sources = await prisma.libraryGeneratedSource.findMany({
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
  return sources.flatMap((source) => {
    const generator = getGenerator(source.key);
    return generator ? [{
      ...source,
      titleMode: generator.titleMode ?? "custom",
      defaultTitle: generator.defaultTitle ?? source.name,
    }] : [];
  });
}

export async function getGeneratedSourceForRun(key: string) {
  return prisma.libraryGeneratedSource.findUnique({
    where: { key },
    select: { enabled: true, defaultConfidentialityLevel: true, outputCategory: true },
  });
}
