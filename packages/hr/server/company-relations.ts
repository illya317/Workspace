import { prisma } from "@workspace/platform/server/prisma";
import { matchSearchFields } from "@workspace/platform/search";
import {
  executeCreate,
  executeDelete,
  executeUpdateField,
  type CrudCreateCommand,
  type CrudDeleteCommand,
  type CrudUpdateFieldCommand,
} from "./hr-crud";
import {
  buildCompanyRelationCreateCommand,
  buildCompanyRelationFieldUpdateCommand,
  COMPANY_RELATION_ALLOWED_FIELDS,
  validateCompanyRelationDeleteCommand,
} from "./domain/company-relation-validation";
import {
  validateCompanyRelationBusinessRules,
  type CompanyRelationRuleState,
} from "./domain/company-relation-rules";

const COMPANY_RELATION_CONFIG = {
  entityType: "CompanyRelation",
  modelKey: "companyRelation" as const,
  allowedFields: COMPANY_RELATION_ALLOWED_FIELDS,
  deleteMode: "hard" as const,
  deleteReferencePolicy: "none" as const,
  onBeforeUpdate: normalizeCompanyRelationFieldUpdate,
  onBeforeDelete: normalizeCompanyRelationDelete,
};

async function normalizeCompanyRelationFieldUpdate(field: string, value: unknown, id?: number) {
  const command = await buildCompanyRelationFieldUpdateCommand(field, value);
  if (!command.ok) return { error: command.issue.message, status: command.issue.status };
  if (!id) return { error: "公司关系ID无效", status: 400 };
  const existing = await prisma.companyRelation.findUnique({
    where: { id },
    select: companyRelationRuleSelection,
  });
  if (!existing) return { error: "公司关系不存在", status: 404 };
  const candidate = { ...existing, [command.data.field]: command.data.value } as CompanyRelationRuleState;
  const issue = await validateProspectiveCompanyRelation(candidate);
  return issue ? { error: issue, status: 400 } : command.data;
}

async function normalizeCompanyRelationDelete(id: number) {
  const command = await validateCompanyRelationDeleteCommand(id);
  return command.ok ? { ok: true as const } : { error: command.issue.message, status: command.issue.status };
}

export async function listCompanyRelations(input: { keyword: string; page: number; pageSize: number }) {
  const relations = await prisma.companyRelation.findMany({
    include: { parent: { select: { id: true, name: true } }, child: { select: { id: true, name: true } } },
    orderBy: { id: "asc" },
  });

  const mapped = relations.map((relation) => ({
    id: relation.id,
    parentId: relation.parentId,
    parentName: relation.parent?.name || "",
    childId: relation.childId,
    childName: relation.child?.name || "",
    shareRatio: relation.shareRatio,
    isConsolidated: relation.isConsolidated,
    effectiveFrom: formatDate(relation.effectiveFrom),
    effectiveTo: formatDate(relation.effectiveTo),
    version: relation.version,
  }));

  let result = mapped;
  if (input.keyword) {
    result = mapped.filter((relation) => matchSearchFields(relation, input.keyword, ["parentName", "childName"]));
  }

  const total = result.length;
  const start = (input.page - 1) * input.pageSize;
  return { relations: result.slice(start, start + input.pageSize), total };
}

export async function createCompanyRelation(command: CrudCreateCommand) {
  return executeCreate(command, { entityType: "CompanyRelation", modelKey: "companyRelation" as const }, async (body) => {
    const createCommand = await buildCompanyRelationCreateCommand(body);
    if (!createCommand.ok) return { error: createCommand.issue.message, status: createCommand.issue.status };
    const issue = await validateProspectiveCompanyRelation(createCommand.data);
    return issue ? { error: issue, status: 400 } : createCommand.data;
  });
}

export async function updateCompanyRelationField(command: CrudUpdateFieldCommand) {
  return executeUpdateField(command, COMPANY_RELATION_CONFIG);
}

export async function deleteCompanyRelation(command: CrudDeleteCommand) {
  return executeDelete(command, COMPANY_RELATION_CONFIG);
}

const companyRelationRuleSelection = {
  id: true,
  parentId: true,
  childId: true,
  isConsolidated: true,
  effectiveFrom: true,
  effectiveTo: true,
} as const;

async function validateProspectiveCompanyRelation(candidate: CompanyRelationRuleState) {
  const relations = await prisma.companyRelation.findMany({ select: companyRelationRuleSelection });
  return validateCompanyRelationBusinessRules(candidate, relations);
}

function formatDate(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}
