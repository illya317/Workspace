import { prisma } from "@/lib/prisma";

export type BudgetVersionStatus = "draft" | "active" | "archived";

export interface CreateVersionInput {
  year: number;
  companyCode?: string;
  name: string;
  type: "dept" | "rd" | "all";
  sourceFile?: string;
  createdBy?: number;
}

export async function createBudgetVersion(input: CreateVersionInput) {
  return prisma.financeBudgetVersion.create({
    data: {
      year: input.year,
      companyCode: input.companyCode ?? null,
      name: input.name,
      status: "draft",
      type: input.type,
      sourceFile: input.sourceFile ?? null,
      createdBy: input.createdBy ?? null,
    },
  });
}

export async function listBudgetVersions(year: number, companyCode?: string) {
  return prisma.financeBudgetVersion.findMany({
    where: { year, companyCode: companyCode ?? null },
    orderBy: { createdAt: "desc" },
  });
}

export async function getActiveVersion(year: number, companyCode?: string) {
  return prisma.financeBudgetVersion.findFirst({
    where: { year, companyCode: companyCode ?? null, status: "active" },
  });
}

export async function getBudgetVersion(versionId: number) {
  return prisma.financeBudgetVersion.findUnique({
    where: { id: versionId },
  });
}

export async function activateBudgetVersion(versionId: number) {
  const version = await prisma.financeBudgetVersion.findUnique({
    where: { id: versionId },
  });
  if (!version) throw new Error("版本不存在");
  if (version.status === "active") return version;

  // 同 (year, companyCode) 下其他 active 版本归档
  await prisma.financeBudgetVersion.updateMany({
    where: {
      year: version.year,
      companyCode: version.companyCode,
      status: "active",
      id: { not: versionId },
    },
    data: { status: "archived" },
  });

  // 激活当前版本
  return prisma.financeBudgetVersion.update({
    where: { id: versionId },
    data: { status: "active" },
  });
}

export async function archiveBudgetVersion(versionId: number) {
  return prisma.financeBudgetVersion.update({
    where: { id: versionId },
    data: { status: "archived" },
  });
}

export async function deleteBudgetVersion(versionId: number) {
  // Prisma schema has onDelete: Cascade on the relation, but SQLite may not enforce it automatically
  // Manually delete children first to be safe
  await prisma.financeBudgetDept.deleteMany({ where: { versionId } });
  await prisma.financeBudgetRd.deleteMany({ where: { versionId } });
  return prisma.financeBudgetVersion.delete({ where: { id: versionId } });
}
