import { prisma } from "./prisma";

export async function listAdminProjects() {
  return prisma.project.findMany({
    select: { id: true, name: true, type: true },
    orderBy: { name: "asc" },
  });
}
