import { Prisma } from "@workspace/platform/server/prisma";
import { mapValidationToServiceResult } from "@workspace/platform/server/domain-validation";
import type { DeleteGuardContext } from "@workspace/platform/server/delete-guard";
import { snapshotHistory } from "@workspace/platform/server/history";
import { prisma } from "@workspace/platform/server/prisma";
import { matchAnyField } from "@workspace/platform/search";
import { handleCreate, handleDelete, handleUpdateField } from "./hr-crud";
import { invalidateCompanyCache } from "./company-directory";
import {
  buildCompanyCreateCommand,
  buildCompanyFieldUpdateCommand,
  buildCompanyUpsertCommand,
  COMPANY_ALLOWED_FIELDS,
  validateCompanyDeleteCommand,
} from "./domain/company-validation";

const COMPANY_CONFIG = {
  entityType: "Company",
  modelKey: "company" as const,
  allowedFields: COMPANY_ALLOWED_FIELDS,
  deleteMode: "hard" as const,
  onBeforeUpdate: normalizeCompanyFieldUpdate,
  onBeforeDelete: normalizeCompanyDelete,
};

async function normalizeCompanyFieldUpdate(field: string, value: unknown) {
  const command = buildCompanyFieldUpdateCommand(field, value);
  if (!command.ok) return { error: command.issue.message, status: command.issue.status };
  invalidateCompanyCache();
  return command.data;
}

async function normalizeCompanyDelete(id: number, context: DeleteGuardContext) {
  const command = await validateCompanyDeleteCommand(id);
  if (!command.ok) return { error: command.issue.message, status: command.issue.status };
  await context.tx.companyRelation.deleteMany({ where: { OR: [{ parentId: command.data.id }, { childId: command.data.id }] } });
  return { ok: true as const };
}

export async function listCompanies(input: { keyword: string; activeOnly: boolean; page: number; pageSize: number }) {
  const where: { isActive?: boolean } = {};
  if (input.activeOnly) where.isActive = true;

  const companies = await prisma.company.findMany({ where, orderBy: { sortOrder: "asc" } });
  const mapped = companies.map((company) => ({
    id: company.id,
    code: company.code,
    name: company.name,
    fullName: company.fullName,
    registeredCapital: company.registeredCapital,
    unifiedCode: company.unifiedCode,
    bankName: company.bankName,
    registeredAddress: company.registeredAddress,
    registeredDate: company.registeredDate,
    legalPerson: company.legalPerson,
    managementGroup: company.managementGroup,
    codePoolCode: company.codePoolCode,
    isActive: company.isActive,
    sortOrder: company.sortOrder,
    version: company.version,
  }));

  const result = input.keyword ? mapped.filter((company) => matchAnyField(company, input.keyword, "Company")) : mapped;
  const total = result.length;
  const start = (input.page - 1) * input.pageSize;
  return { companies: result.slice(start, start + input.pageSize), total };
}

export async function createCompany(request: Request) {
  return handleCreate(request, { entityType: "Company", modelKey: "company" as const }, (body) => {
    const command = buildCompanyCreateCommand(body);
    if (!command.ok) return null;
    invalidateCompanyCache();
    return command.data;
  });
}

export async function upsertCompany(body: Record<string, unknown>, userId: number) {
  const command = mapValidationToServiceResult(await buildCompanyUpsertCommand(body));
  if (!command.ok) return command;
  const { id, code, name, dataFields } = command.data;

  if (id) {
    await prisma.company.update({
      where: { id },
      data: { code, name, ...dataFields, editedBy: userId, editedAt: new Date(), version: { increment: 1 } },
    });
    await snapshotHistory("Company", id, userId);
  } else {
    await prisma.company.create({ data: { code, name, ...dataFields } });
  }
  invalidateCompanyCache();
  return { ok: true as const, data: { success: true } };
}

export async function updateCompanyField(request: Request, params: Promise<{ id: string }>) {
  return handleUpdateField(request, params, COMPANY_CONFIG);
}

export async function deleteCompanyByParams(request: Request, params: Promise<{ id: string }>) {
  return handleDelete(request, params, COMPANY_CONFIG);
}

export function isPrismaCompanyError(error: unknown, code: string) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}
