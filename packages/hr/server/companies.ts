import { Prisma } from "@workspace/platform/server/prisma";
import { snapshotHistory } from "@workspace/platform/server/history";
import { prisma } from "@workspace/platform/server/prisma";
import { matchAnyField } from "@workspace/platform/search";
import { handleCreate, handleDelete, handleUpdateField } from "./hr-crud";
import { invalidateCompanyCache } from "./company-directory";

const COMPANY_FIELDS = [
  "code",
  "name",
  "fullName",
  "registeredCapital",
  "unifiedCode",
  "bankName",
  "registeredAddress",
  "registeredDate",
  "legalPerson",
  "managementGroup",
  "codePoolCode",
  "isActive",
  "sortOrder",
];
const COMPANY_CONFIG = { entityType: "Company", modelKey: "company" as const, allowedFields: COMPANY_FIELDS };

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
  }));

  const result = input.keyword ? mapped.filter((company) => matchAnyField(company, input.keyword, "Company")) : mapped;
  const total = result.length;
  const start = (input.page - 1) * input.pageSize;
  return { companies: result.slice(start, start + input.pageSize), total };
}

export async function createCompany(request: Request) {
  return handleCreate(request, { entityType: "Company", modelKey: "company" as const }, (body) => {
    for (const field of ["code", "name"]) if (!body[field]) return null;
    invalidateCompanyCache();
    return body;
  });
}

function companyDataFields(body: Record<string, unknown>) {
  const nullableString = (value: unknown) => (value === null || value === undefined || value === "" ? null : String(value));
  const sortOrder = Number(body.sortOrder);
  return {
    fullName: nullableString(body.fullName),
    registeredCapital: nullableString(body.registeredCapital),
    unifiedCode: nullableString(body.unifiedCode),
    bankName: nullableString(body.bankName),
    registeredAddress: nullableString(body.registeredAddress),
    registeredDate: nullableString(body.registeredDate),
    legalPerson: nullableString(body.legalPerson),
    managementGroup: nullableString(body.managementGroup) ?? "常规体系",
    codePoolCode: nullableString(body.codePoolCode),
    isActive: typeof body.isActive === "boolean" ? body.isActive : true,
    sortOrder: Number.isInteger(sortOrder) ? sortOrder : 0,
  };
}

export async function upsertCompany(body: Record<string, unknown>, userId: number) {
  const id = body.id ? Number(body.id) : null;
  const code = String(body.code || "").trim();
  const name = String(body.name || "").trim();
  if (!code || !name) return { ok: false as const, error: "缺少 code/name" };

  const dataFields = companyDataFields(body);
  if (id) {
    const existing = await prisma.company.findFirst({ where: { code } });
    if (existing && existing.id !== id) return { ok: false as const, error: "编码已存在" };
    await prisma.company.update({
      where: { id },
      data: { code, name, ...dataFields, editedBy: userId, editedAt: new Date(), version: { increment: 1 } },
    });
    await snapshotHistory("Company", id, userId);
  } else {
    const existing = await prisma.company.findFirst({ where: { code } });
    if (existing) return { ok: false as const, error: "编码已存在" };
    await prisma.company.create({ data: { code, name, ...dataFields } });
  }
  invalidateCompanyCache();
  return { ok: true as const, data: { success: true } };
}

export async function deleteCompanyById(id: number) {
  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) return { ok: false as const, error: "公司不存在", status: 404 };
  await prisma.companyRelation.deleteMany({ where: { OR: [{ parentId: id }, { childId: id }] } });
  await prisma.company.delete({ where: { id } });
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
