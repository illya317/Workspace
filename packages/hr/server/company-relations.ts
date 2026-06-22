import { prisma } from "@workspace/platform/server/prisma";
import { matchSearchFields } from "@workspace/platform/search";
import { handleCreate, handleDelete, handleUpdateField } from "./hr-crud";
import {
  buildCompanyRelationCreateCommand,
  buildCompanyRelationFieldUpdateCommand,
  COMPANY_RELATION_ALLOWED_FIELDS,
  validateCompanyRelationDeleteCommand,
} from "./domain/company-relation-validation";

const COMPANY_RELATION_CONFIG = {
  entityType: "CompanyRelation",
  modelKey: "companyRelation" as const,
  allowedFields: COMPANY_RELATION_ALLOWED_FIELDS,
  deleteMode: "hard" as const,
  deleteReferencePolicy: "none" as const,
  onBeforeUpdate: normalizeCompanyRelationFieldUpdate,
  onBeforeDelete: normalizeCompanyRelationDelete,
};

async function normalizeCompanyRelationFieldUpdate(field: string, value: unknown) {
  const command = await buildCompanyRelationFieldUpdateCommand(field, value);
  return command.ok ? command.data : { error: command.issue.message, status: command.issue.status };
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
  }));

  let result = mapped;
  if (input.keyword) {
    result = mapped.filter((relation) => matchSearchFields(relation, input.keyword, ["parentName", "childName"]));
  }

  const total = result.length;
  const start = (input.page - 1) * input.pageSize;
  return { relations: result.slice(start, start + input.pageSize), total };
}

export async function createCompanyRelation(request: Request) {
  return handleCreate(request, { entityType: "CompanyRelation", modelKey: "companyRelation" as const }, (body) => {
    return buildCompanyRelationCreateCommand(body).then((command) => (command.ok ? command.data : null));
  });
}

export async function updateCompanyRelationField(request: Request, params: Promise<{ id: string }>) {
  return handleUpdateField(request, params, COMPANY_RELATION_CONFIG);
}

export async function deleteCompanyRelation(request: Request, params: Promise<{ id: string }>) {
  return handleDelete(request, params, COMPANY_RELATION_CONFIG);
}
