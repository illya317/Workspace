import { prisma } from "@workspace/platform/server/prisma";
import { buildBudgetVersionCreateCommand, buildFinanceIdCommand } from "../domain/finance-validation";

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
  const command = buildBudgetVersionCreateCommand(input);
  if (!command.ok) throw new Error(command.issue.message);
  return prisma.financeBudgetVersion.create({
    data: {
      year: command.data.data.year,
      companyCode: command.data.data.companyCode ?? null,
      name: command.data.data.name,
      status: "draft",
      type: command.data.data.type,
      sourceFile: command.data.data.sourceFile ?? null,
      createdBy: command.data.data.createdBy ?? null,
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
  const command = buildFinanceIdCommand(versionId, "versionId");
  if (!command.ok) throw new Error(command.issue.message);
  const version = await prisma.financeBudgetVersion.findUnique({
    where: { id: command.data.id },
  });
  if (!version) throw new Error("版本不存在");
  if (version.status === "active") return version;

  // 同 (year, companyCode) 下其他 active 版本归档
  await prisma.financeBudgetVersion.updateMany({
    where: {
      year: version.year,
      companyCode: version.companyCode,
      status: "active",
      id: { not: command.data.id },
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
  const command = buildFinanceIdCommand(versionId, "versionId");
  if (!command.ok) throw new Error(command.issue.message);
  return prisma.financeBudgetVersion.update({
    where: { id: command.data.id },
    data: { status: "archived" },
  });
}

export async function deleteBudgetVersion(versionId: number) {
  const command = buildFinanceIdCommand(versionId, "versionId");
  if (!command.ok) throw new Error(command.issue.message);
  // Prisma schema has onDelete: Cascade on the relation, but SQLite may not enforce it automatically
  // Manually delete children first to be safe
  await prisma.financeBudgetDept.deleteMany({ where: { versionId: command.data.id } });
  await prisma.financeBudgetRd.deleteMany({ where: { versionId: command.data.id } });
  return prisma.financeBudgetVersion.delete({ where: { id: command.data.id } });
}
