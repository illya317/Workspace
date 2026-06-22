import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import { prisma } from "@workspace/platform/server/prisma";

export const COMPANY_ALLOWED_FIELDS = [
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

function nullableString(value: unknown) {
  return value === null || value === undefined || value === "" ? null : String(value);
}

function companyDataFields(body: Record<string, unknown>) {
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

function parseOptionalCompanyId(value: unknown): DomainValidationResult<number | null> {
  if (value === null || value === undefined || value === "") return okCommand(null);
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return failCommand("公司ID无效");
  return okCommand(id);
}

export function buildCompanyCreateCommand(body: Record<string, unknown>) {
  const code = String(body.code || "").trim();
  const name = String(body.name || "").trim();
  if (!code || !name) return failCommand("缺少 code/name");
  return okCommand({ code, name, ...companyDataFields(body) });
}

export async function buildCompanyUpsertCommand(body: Record<string, unknown>) {
  const parsedId = parseOptionalCompanyId(body.id);
  if (!parsedId.ok) return parsedId;
  const id = parsedId.data;
  const code = String(body.code || "").trim();
  const name = String(body.name || "").trim();
  if (!code || !name) return failCommand("缺少 code/name");

  const existing = await prisma.company.findFirst({ where: { code }, select: { id: true } });
  if (existing && existing.id !== id) return failCommand("编码已存在", 409);
  return okCommand({ id, code, name, dataFields: companyDataFields(body) });
}

export async function validateCompanyDeleteCommand(id: unknown): Promise<DomainValidationResult<{ id: number }>> {
  const parsedId = parseOptionalCompanyId(id);
  if (!parsedId.ok || parsedId.data === null) return failCommand("公司ID无效");
  const company = await prisma.company.findUnique({ where: { id: parsedId.data }, select: { id: true } });
  if (!company) return failCommand("公司不存在", 404);
  return okCommand({ id: parsedId.data });
}

export function buildCompanyFieldUpdateCommand(field: string, value: unknown): DomainValidationResult<{ field: string; value: unknown }> {
  if (field === "sortOrder") {
    const number = Number(value);
    return okCommand({ field, value: Number.isInteger(number) ? number : 0 });
  }
  if (field === "isActive") return okCommand({ field, value: Boolean(value) });
  if (COMPANY_ALLOWED_FIELDS.includes(field)) return okCommand({ field, value: nullableString(value) });
  return okCommand({ field, value });
}
