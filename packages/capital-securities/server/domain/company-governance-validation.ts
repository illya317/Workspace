import { failCommand, okCommand } from "@workspace/platform/server/domain-validation";
import type { PartyIdentityInput } from "@workspace/platform/server/party-directory";
import { prisma } from "@workspace/platform/server/prisma";
import { getTenantProfile } from "@workspace/platform/server/tenant-config";

function nullableString(value: unknown) {
  return value === null || value === undefined || value === "" ? null : String(value).trim();
}

function positiveId(value: unknown, label: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? okCommand(id) : failCommand(`${label}无效`);
}

function companyIdentityData(body: Record<string, unknown>): PartyIdentityInput {
  const code = String(body.code ?? "").trim();
  const identityNumber = String(body.unifiedCode ?? "").trim().toUpperCase() || `TEMP-COMPANY-${code}`;
  return {
    subjectType: "organization",
    name: String(body.name ?? "").trim(),
    fullName: nullableString(body.fullName),
    identityNumber,
    legalRepresentative: nullableString(body.legalPerson),
  };
}

function companyRoleData(body: Record<string, unknown>) {
  const sortOrder = Number(body.sortOrder);
  return {
    code: String(body.code ?? "").trim(),
    description: nullableString(body.description),
    registeredCapital: nullableString(body.registeredCapital),
    bankName: nullableString(body.bankName),
    registeredAddress: nullableString(body.registeredAddress),
    registeredDate: nullableString(body.registeredDate),
    managementGroup: nullableString(body.managementGroup) ?? getTenantProfile().organization.managementGroups.default,
    codePoolCode: nullableString(body.codePoolCode),
    isActive: typeof body.isActive === "boolean" ? body.isActive : true,
    sortOrder: Number.isInteger(sortOrder) ? sortOrder : 0,
  };
}

async function validateCompanyData(body: Record<string, unknown>, id?: number) {
  const identityData = companyIdentityData(body);
  const companyData = companyRoleData(body);
  if (!companyData.code || !identityData.name) return failCommand("请填写公司编码和简称");
  const duplicate = await prisma.company.findFirst({
    where: { code: companyData.code, ...(id ? { id: { not: id } } : {}) },
    select: { id: true },
  });
  if (duplicate) return failCommand("公司编码已存在", 409, "code");
  return okCommand({ identityData, companyData });
}

export async function buildCompanyCreateCommand(body: Record<string, unknown>) {
  return validateCompanyData(body);
}

export async function buildCompanyUpdateCommand(body: Record<string, unknown>) {
  const id = positiveId(body.id, "公司ID");
  if (!id.ok) return id;
  const version = Number(body.version);
  const partyVersion = Number(body.partyVersion);
  const legalFactRevision = Number(body.legalFactRevision);
  if (!Number.isInteger(version) || version < 0) return failCommand("公司版本无效，请刷新后重试", 400, "version");
  if (!Number.isInteger(partyVersion) || partyVersion < 0) return failCommand("主体版本无效，请刷新后重试", 400, "partyVersion");
  if (!Number.isInteger(legalFactRevision) || legalFactRevision < 0) return failCommand("法定事实版本无效，请刷新后重试", 400, "legalFactRevision");
  const existing = await prisma.company.findUnique({
    where: { id: id.data },
    select: { id: true, party: { select: { fullName: true, legalRepresentative: true } } },
  });
  if (!existing) return failCommand("公司不存在", 404);
  const validated = await validateCompanyData(body, id.data);
  if (validated.ok && validated.data.identityData.fullName !== existing.party.fullName) {
    return failCommand("公司法定名称由主体名称沿革生成，请通过名称变更事实维护", 409, "fullName");
  }
  if (validated.ok && validated.data.identityData.legalRepresentative !== existing.party.legalRepresentative) {
    return failCommand("当前法定代表人由法人变更历史生成，请通过变更事实维护", 409, "legalPerson");
  }
  return validated.ok
    ? okCommand({ id: id.data, version, partyVersion, legalFactRevision, ...validated.data })
    : validated;
}
