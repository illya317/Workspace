import { prisma } from "@workspace/platform/server/prisma";
import { buildFinanceIdCommand } from "../domain/shared-validation";
import { buildBudgetVersionCreateCommand } from "./validation";

export type BudgetVersionStatus = "draft" | "active" | "archived";

export interface CreateVersionInput {
  year: number;
  companyCode?: string;
  name: string;
  type: "dept" | "rd" | "all";
  sourceFile?: string;
  createdBy?: number;
}

async function resolveBudgetCompany(companyCode?: string) {
  const normalized = companyCode?.trim() || null;
  if (!normalized) return { id: null, code: null };
  const company = await prisma.company.findUnique({ where: { code: normalized }, select: { id: true, code: true } });
  if (!company) throw new Error(`公司编码不存在：${normalized}`);
  return company;
}

function budgetCompanyWhere(company: { id: number | null; code: string | null }) {
  if (company.id === null) return { companyId: null, companyCode: company.code };
  return {
    OR: [
      { companyId: company.id },
      { companyId: null, companyCode: company.code },
    ],
  };
}

export async function createBudgetVersion(input: CreateVersionInput) {
  const command = buildBudgetVersionCreateCommand(input);
  if (!command.ok) throw new Error(command.issue.message);
  const company = await resolveBudgetCompany(command.data.data.companyCode);
  return prisma.financeBudgetVersion.create({
    data: {
      year: command.data.data.year,
      companyId: company.id,
      companyCode: company.code,
      name: command.data.data.name,
      status: "draft",
      type: command.data.data.type,
      sourceFile: command.data.data.sourceFile ?? null,
      createdBy: command.data.data.createdBy ?? null,
    },
  });
}

export async function listBudgetVersions(year: number, companyCode?: string) {
  const company = await resolveBudgetCompany(companyCode);
  return prisma.financeBudgetVersion.findMany({
    where: {
      year,
      ...budgetCompanyWhere(company),
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getActiveVersion(year: number, companyCode?: string) {
  const company = await resolveBudgetCompany(companyCode);
  return prisma.financeBudgetVersion.findFirst({
    where: {
      year,
      status: "active",
      ...budgetCompanyWhere(company),
    },
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

  // 同 (year, companyId) 下其他 active 版本归档
  await prisma.financeBudgetVersion.updateMany({
    where: {
      year: version.year,
      ...budgetCompanyWhere({ id: version.companyId, code: version.companyCode }),
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
