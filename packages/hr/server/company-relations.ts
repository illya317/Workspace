import { authorize, isSuperAdmin, type AuthorizeAction } from "@workspace/platform/server/auth";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { createCrudExecutor } from "@workspace/platform/server/crud-factory";
import { ensureEditHistoryBaseline, snapshotHistory } from "@workspace/platform/server/history";
import { prisma } from "@workspace/platform/server/prisma";
import { matchSearchFields } from "@workspace/platform/search";
import {
  type CrudCreateCommand,
  type CrudDeleteCommand,
  type CrudUpdateFieldCommand,
} from "./hr-crud";
import {
  buildCompanyRelationCreateCommand,
  buildCompanyRelationFieldUpdateCommand,
  buildCompanyRelationPageDraftCommand,
  COMPANY_RELATION_ALLOWED_FIELDS,
  type CompanyRelationPageDraftInput,
  type CompanyRelationPageDraftPatch,
  validateCompanyRelationDeleteCommand,
} from "./domain/company-relation-validation";
import {
  validateCompanyRelationBusinessRules,
  type CompanyRelationRuleState,
} from "./domain/company-relation-rules";

const COMPANY_RELATION_BASE_CONFIG = {
  entityType: "CompanyRelation",
  modelKey: "companyRelation" as const,
};

const companyRelationCreateExecutor = createCrudExecutor({
  ...COMPANY_RELATION_BASE_CONFIG,
  writeCheck: (userId) => checkCompanyRelationAction(userId, "create"),
});

const companyRelationMutationExecutor = createCrudExecutor({
  ...COMPANY_RELATION_BASE_CONFIG,
  writeCheck: async () => true,
  deleteCheck: async () => true,
  allowedFields: COMPANY_RELATION_ALLOWED_FIELDS,
  deleteMode: "hard" as const,
  deleteReferencePolicy: "none" as const,
});

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
  return companyRelationCreateExecutor.executeCreate(command, async (body) => {
    const createCommand = await buildCompanyRelationCreateCommand(body);
    if (!createCommand.ok) return { error: createCommand.issue.message, status: createCommand.issue.status };
    const issue = await validateProspectiveCompanyRelation(createCommand.data);
    return issue ? { error: issue, status: 400 } : createCommand.data;
  });
}

export async function updateCompanyRelationField(command: CrudUpdateFieldCommand) {
  if (!(await checkCompanyRelationAction(command.userId, "update"))) return serviceError("无权限", 403);
  const normalized = await buildCompanyRelationFieldUpdateCommand(command.field, command.value);
  if (!normalized.ok) return serviceError(normalized.issue.message, normalized.issue.status);
  const existing = await prisma.companyRelation.findUnique({
    where: { id: command.id },
    select: companyRelationRuleSelection,
  });
  if (!existing) return serviceError("公司关系不存在", 404);
  const candidate = { ...existing, [normalized.data.field]: normalized.data.value } as CompanyRelationRuleState;
  const issue = await validateProspectiveCompanyRelation(candidate);
  if (issue) return serviceError(issue, 400);
  return companyRelationMutationExecutor.executeUpdateField({
    ...command,
    field: normalized.data.field,
    value: normalized.data.value,
  });
}

export async function deleteCompanyRelation(command: CrudDeleteCommand) {
  if (!(await checkCompanyRelationAction(command.userId, "delete"))) return serviceError("无权限", 403);
  const validated = await validateCompanyRelationDeleteCommand(command.id);
  if (!validated.ok) return serviceError(validated.issue.message, validated.issue.status);
  return companyRelationMutationExecutor.executeDelete(command);
}

class CompanyRelationVersionConflictError extends Error {}

export async function updateCompanyRelationPageDraft(input: CompanyRelationPageDraftInput) {
  const command = await buildCompanyRelationPageDraftCommand(input);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status);
  if (!(await checkCompanyRelationAction(command.data.userId, "update"))) {
    return serviceError("无权限", 403);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const relations = await tx.companyRelation.findMany({ select: companyRelationPageDraftSelection });
      const relationById = new Map(relations.map((relation) => [relation.id, relation]));
      const patchesById = new Map<number, CompanyRelationPageDraftPatch>();
      const expectedVersionById = new Map<number, number>();
      for (const change of command.data.changes) {
        if (!relationById.has(change.id)) return serviceError("部分公司关系不存在，请刷新后重试", 404);
        patchesById.set(change.id, { ...(patchesById.get(change.id) ?? {}), ...change.data });
        expectedVersionById.set(change.id, change.expectedVersion);
      }

      const candidates = relations.map((relation) => ({
        ...relation,
        ...(patchesById.get(relation.id) ?? {}),
      }));
      for (const id of patchesById.keys()) {
        const candidate = candidates.find((relation) => relation.id === id);
        if (!candidate) return serviceError("公司关系不存在，请刷新后重试", 404);
        const issue = validateCompanyRelationBusinessRules(candidate, candidates);
        if (issue) return serviceError(issue, 400);
      }

      for (const [id, patch] of patchesById) {
        await ensureEditHistoryBaseline("CompanyRelation", id, command.data.userId, tx);
        const updated = await tx.companyRelation.updateMany({
          where: { id, version: expectedVersionById.get(id) },
          data: {
            ...patch,
            editedBy: command.data.userId,
            editedAt: new Date(),
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) throw new CompanyRelationVersionConflictError();
        await snapshotHistory("CompanyRelation", id, command.data.userId, tx);
      }
      return serviceOk({
        success: true,
        updatedCount: patchesById.size,
        changeCount: command.data.changes.length,
      });
    });
  } catch (error) {
    if (error instanceof CompanyRelationVersionConflictError) {
      return serviceError("公司关系已发生并发变化，请刷新后重试", 409);
    }
    throw error;
  }
}

const companyRelationRuleSelection = {
  id: true,
  parentId: true,
  childId: true,
  isConsolidated: true,
  effectiveFrom: true,
  effectiveTo: true,
} as const;

const companyRelationPageDraftSelection = {
  ...companyRelationRuleSelection,
  shareRatio: true,
  version: true,
} as const;

async function checkCompanyRelationAction(userId: number, action: AuthorizeAction) {
  if (await isSuperAdmin(userId)) return true;
  return authorize({ user: userId, resourceKey: "hr.roster", action });
}

async function validateProspectiveCompanyRelation(candidate: CompanyRelationRuleState) {
  const relations = await prisma.companyRelation.findMany({ select: companyRelationRuleSelection });
  return validateCompanyRelationBusinessRules(candidate, relations);
}

function formatDate(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}
