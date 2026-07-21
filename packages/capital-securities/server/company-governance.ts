import { authorize, type AuthorizeAction } from "@workspace/platform/server/auth";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { ensureEditHistoryBaseline, snapshotHistory } from "@workspace/platform/server/history";
import { invalidateCompanyCache } from "@workspace/platform/server/company-directory";
import { prisma } from "@workspace/platform/server/prisma";
import { matchSearchFields } from "@workspace/platform/search";
import type { CompanyRecord, CompanyRelationRecord } from "../types";
import {
  buildCompanyCreateCommand,
  buildCompanyRelationCreateCommand,
  buildCompanyRelationUpdateCommand,
  buildCompanyUpdateCommand,
  validateCompanyRelationDeleteCommand,
} from "./domain/company-governance-validation";
import {
  validateCompanyRelationBusinessRules,
  type CompanyRelationRuleState,
} from "./domain/company-relation-rules";

type WriteCommand = { userId: number; body: Record<string, unknown> };
type DeleteCommand = { userId: number; id: number; expectedVersion: number | undefined };
const RESOURCE_KEY = "capitalSecurities.governance";

async function can(userId: number, action: AuthorizeAction) {
  return authorize({ user: userId, resourceKey: RESOURCE_KEY, action });
}

export async function listCompanies(input: { keyword: string; activeOnly: boolean; page: number; pageSize: number }) {
  const companies = await prisma.company.findMany({
    where: input.activeOnly ? { isActive: true } : undefined,
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });
  const mapped: CompanyRecord[] = companies.map((company) => ({
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
  const filtered = input.keyword
    ? mapped.filter((company) => matchSearchFields(company, input.keyword, ["code", "name", "fullName", "unifiedCode"]))
    : mapped;
  const start = (input.page - 1) * input.pageSize;
  return { companies: filtered.slice(start, start + input.pageSize), total: filtered.length };
}

export async function createCompany(command: WriteCommand) {
  if (!(await can(command.userId, "create"))) return serviceError("无权限", 403);
  const validated = await buildCompanyCreateCommand(command.body);
  if (!validated.ok) return serviceError(validated.issue.message, validated.issue.status);
  const record = await prisma.company.create({ data: { ...validated.data, editedBy: command.userId } });
  invalidateCompanyCache();
  await snapshotHistory("Company", record.id, command.userId);
  return serviceOk({ success: true, record: { id: record.id } });
}

export async function updateCompany(command: WriteCommand) {
  if (!(await can(command.userId, "update"))) return serviceError("无权限", 403);
  const validated = await buildCompanyUpdateCommand(command.body);
  if (!validated.ok) return serviceError(validated.issue.message, validated.issue.status);
  const updated = await prisma.$transaction(async (tx) => {
    await ensureEditHistoryBaseline("Company", validated.data.id, command.userId, tx);
    const result = await tx.company.updateMany({
      where: { id: validated.data.id, version: validated.data.version },
      data: { ...validated.data.data, editedBy: command.userId, editedAt: new Date(), version: { increment: 1 } },
    });
    if (result.count === 1) await snapshotHistory("Company", validated.data.id, command.userId, tx);
    return result.count;
  });
  if (updated !== 1) return serviceError("公司信息已发生变化，请刷新后重试", 409);
  invalidateCompanyCache();
  return serviceOk({ success: true });
}

export async function listCompanyRelations(input: { keyword: string; page: number; pageSize: number }) {
  const relations = await prisma.companyRelation.findMany({
    include: { parent: { select: { name: true } }, child: { select: { name: true } } },
    orderBy: [{ parentId: "asc" }, { childId: "asc" }, { effectiveFrom: "asc" }],
  });
  const mapped: CompanyRelationRecord[] = relations.map((relation) => ({
    id: relation.id,
    parentId: relation.parentId,
    parentName: relation.parent.name,
    childId: relation.childId,
    childName: relation.child.name,
    shareRatio: relation.shareRatio,
    isConsolidated: relation.isConsolidated,
    effectiveFrom: formatDate(relation.effectiveFrom),
    effectiveTo: formatDate(relation.effectiveTo),
    version: relation.version,
  }));
  const filtered = input.keyword
    ? mapped.filter((relation) => matchSearchFields(relation, input.keyword, ["parentName", "childName"]))
    : mapped;
  const start = (input.page - 1) * input.pageSize;
  return { relations: filtered.slice(start, start + input.pageSize), total: filtered.length };
}

export async function createCompanyRelation(command: WriteCommand) {
  if (!(await can(command.userId, "create"))) return serviceError("无权限", 403);
  const validated = await buildCompanyRelationCreateCommand(command.body);
  if (!validated.ok) return serviceError(validated.issue.message, validated.issue.status);
  const issue = await validateProspectiveRelation(validated.data);
  if (issue) return serviceError(issue, 400);
  const record = await prisma.companyRelation.create({ data: { ...validated.data, editedBy: command.userId } });
  await snapshotHistory("CompanyRelation", record.id, command.userId);
  return serviceOk({ success: true, record: { id: record.id } });
}

export async function updateCompanyRelation(command: WriteCommand) {
  if (!(await can(command.userId, "update"))) return serviceError("无权限", 403);
  const validated = await buildCompanyRelationUpdateCommand(command.body);
  if (!validated.ok) return serviceError(validated.issue.message, validated.issue.status);
  const issue = await validateProspectiveRelation({ id: validated.data.id, ...validated.data.data });
  if (issue) return serviceError(issue, 400);
  const updated = await prisma.$transaction(async (tx) => {
    await ensureEditHistoryBaseline("CompanyRelation", validated.data.id, command.userId, tx);
    const result = await tx.companyRelation.updateMany({
      where: { id: validated.data.id, version: validated.data.version },
      data: { ...validated.data.data, editedBy: command.userId, editedAt: new Date(), version: { increment: 1 } },
    });
    if (result.count === 1) await snapshotHistory("CompanyRelation", validated.data.id, command.userId, tx);
    return result.count;
  });
  return updated === 1
    ? serviceOk({ success: true })
    : serviceError("公司关系已发生变化，请刷新后重试", 409);
}

export async function deleteCompanyRelation(command: DeleteCommand) {
  if (!(await can(command.userId, "delete"))) return serviceError("无权限", 403);
  const validated = await validateCompanyRelationDeleteCommand(command.id, command.expectedVersion);
  if (!validated.ok) return serviceError(validated.issue.message, validated.issue.status);
  const deleted = await prisma.$transaction(async (tx) => {
    await ensureEditHistoryBaseline("CompanyRelation", validated.data.id, command.userId, tx);
    await snapshotHistory("CompanyRelation", validated.data.id, command.userId, tx);
    const result = await tx.companyRelation.deleteMany({
      where: { id: validated.data.id, version: validated.data.version },
    });
    return result.count;
  });
  return deleted === 1
    ? serviceOk({ success: true, id: validated.data.id })
    : serviceError("公司关系已发生变化，请刷新后重试", 409);
}

async function validateProspectiveRelation(candidate: CompanyRelationRuleState) {
  const relations = await prisma.companyRelation.findMany({
    select: { id: true, parentId: true, childId: true, isConsolidated: true, effectiveFrom: true, effectiveTo: true },
  });
  return validateCompanyRelationBusinessRules(candidate, relations);
}

function formatDate(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}
