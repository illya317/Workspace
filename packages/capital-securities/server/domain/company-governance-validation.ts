import { failCommand, okCommand } from "@workspace/platform/server/domain-validation";
import { prisma } from "@workspace/platform/server/prisma";
import {
  INVALID_COMPANY_RELATION_VALUE,
  normalizeCompanyRelationDate,
  normalizeCompanyRelationShareRatio,
  validateCompanyRelationDateRange,
} from "./company-relation-rules";

function nullableString(value: unknown) {
  return value === null || value === undefined || value === "" ? null : String(value).trim();
}

function positiveId(value: unknown, label: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? okCommand(id) : failCommand(`${label}无效`);
}

function companyData(body: Record<string, unknown>) {
  const sortOrder = Number(body.sortOrder);
  return {
    code: String(body.code ?? "").trim(),
    name: String(body.name ?? "").trim(),
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

async function validateCompanyIdentity(data: ReturnType<typeof companyData>, id?: number) {
  if (!data.code || !data.name) return failCommand("请填写公司编码和简称");
  const duplicate = await prisma.company.findFirst({
    where: { OR: [{ code: data.code }, { name: data.name }], ...(id ? { id: { not: id } } : {}) },
    select: { code: true, name: true },
  });
  if (duplicate?.code === data.code) return failCommand("公司编码已存在", 409, "code");
  if (duplicate?.name === data.name) return failCommand("公司简称已存在", 409, "name");
  return okCommand(data);
}

export async function buildCompanyCreateCommand(body: Record<string, unknown>) {
  return validateCompanyIdentity(companyData(body));
}

export async function buildCompanyUpdateCommand(body: Record<string, unknown>) {
  const id = positiveId(body.id, "公司ID");
  if (!id.ok) return id;
  const version = Number(body.version);
  if (!Number.isInteger(version) || version < 0) return failCommand("公司版本无效，请刷新后重试", 400, "version");
  const existing = await prisma.company.findUnique({ where: { id: id.data }, select: { id: true } });
  if (!existing) return failCommand("公司不存在", 404);
  const validated = await validateCompanyIdentity(companyData(body), id.data);
  return validated.ok ? okCommand({ id: id.data, version, data: validated.data }) : validated;
}

async function validateCompanyId(value: unknown, label: string) {
  const parsed = positiveId(value, `${label}公司ID`);
  if (!parsed.ok) return parsed;
  const company = await prisma.company.findUnique({ where: { id: parsed.data }, select: { id: true } });
  return company ? okCommand(company.id) : failCommand(`${label}公司不存在`, 404);
}

async function relationData(body: Record<string, unknown>) {
  const parent = await validateCompanyId(body.parentId, "持股方");
  if (!parent.ok) return parent;
  const child = await validateCompanyId(body.childId, "被持股方");
  if (!child.ok) return child;
  if (parent.data === child.data) return failCommand("持股方和被持股方不能相同");
  const shareRatio = normalizeCompanyRelationShareRatio(body.shareRatio);
  if (shareRatio === INVALID_COMPANY_RELATION_VALUE) return failCommand("持股比例必须在 0 到 1 之间", 400, "shareRatio");
  const effectiveFrom = normalizeCompanyRelationDate(body.effectiveFrom);
  if (effectiveFrom === INVALID_COMPANY_RELATION_VALUE) return failCommand("生效日期无效", 400, "effectiveFrom");
  const effectiveTo = normalizeCompanyRelationDate(body.effectiveTo);
  if (effectiveTo === INVALID_COMPANY_RELATION_VALUE) return failCommand("失效日期无效", 400, "effectiveTo");
  const dateIssue = validateCompanyRelationDateRange(effectiveFrom, effectiveTo);
  return dateIssue
    ? failCommand(dateIssue, 400, "effectiveTo")
    : okCommand({
        parentId: parent.data,
        childId: child.data,
        shareRatio,
        isConsolidated: Boolean(body.isConsolidated),
        effectiveFrom,
        effectiveTo,
      });
}

export async function buildCompanyRelationCreateCommand(body: Record<string, unknown>) {
  return relationData(body);
}

export async function buildCompanyRelationUpdateCommand(body: Record<string, unknown>) {
  const id = positiveId(body.id, "公司关系ID");
  if (!id.ok) return id;
  const version = Number(body.version);
  if (!Number.isInteger(version) || version < 0) return failCommand("公司关系版本无效，请刷新后重试", 400, "version");
  const existing = await prisma.companyRelation.findUnique({ where: { id: id.data }, select: { id: true } });
  if (!existing) return failCommand("公司关系不存在", 404);
  const validated = await relationData(body);
  return validated.ok ? okCommand({ id: id.data, version, data: validated.data }) : validated;
}

export async function validateCompanyRelationDeleteCommand(idValue: unknown, versionValue: unknown) {
  const id = positiveId(idValue, "公司关系ID");
  if (!id.ok) return id;
  const version = Number(versionValue);
  if (!Number.isInteger(version) || version < 0) return failCommand("公司关系版本无效，请刷新后重试", 400, "version");
  const existing = await prisma.companyRelation.findUnique({ where: { id: id.data }, select: { id: true } });
  return existing ? okCommand({ id: id.data, version }) : failCommand("公司关系不存在", 404);
}
