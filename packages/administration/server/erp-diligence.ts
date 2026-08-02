import { calculateErpDiligenceCompletion } from "@workspace/administration/constants";
import {
  ERP_DILIGENCE_CAMPAIGN_KEY,
  type ErpDiligenceEvidenceItem,
  type ErpDiligencePositionOption,
  type ErpDiligenceProcessStep,
  type ErpDiligenceResponsibilityPositionOption,
  type ErpDiligenceSubmissionDto,
  type ErpDiligenceWorkspaceDto,
} from "@workspace/administration/types";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { evaluatePermissionAction } from "@workspace/platform/server/auth";
import {
  defineBusinessActionCommandAdapter,
  executeDirectBusinessActionCommand,
} from "@workspace/platform/server/business-action-executor";
import { workspaceBusinessDayStart } from "@workspace/platform/server/business-date";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import {
  businessActorIdentity,
  getUserActivePositionAssignments,
  getUserEmployeeIdentity,
  type UserActivePositionAssignment,
} from "@workspace/platform/server/user-identity";
import { buildErpDiligenceSaveCommand, type ErpDiligenceSaveCommand } from "./domain/erp-diligence-validation";
import {
  ERP_DILIGENCE_ATTACHMENT_METADATA_SELECT,
  toErpDiligenceEvidenceAttachmentDto,
} from "./erp-diligence-evidence";
import {
  ErpDiligenceAnswersSchema,
  ErpDiligenceEvidenceItemSchema,
  ErpDiligenceProcessStepSchema,
  type ErpDiligenceSaveInput,
} from "./erp-diligence-schemas";

const VIEW_ALL_RESOURCE = "administration.erpDiligence.viewAll";

const ERP_DILIGENCE_RECORD_INCLUDE = {
  evidenceAttachments: {
    select: ERP_DILIGENCE_ATTACHMENT_METADATA_SELECT,
    orderBy: [{ uploadedAt: "asc" }, { id: "asc" }],
  },
} satisfies Prisma.ErpDueDiligenceSubmissionInclude;

type ErpDiligenceRecord = Prisma.ErpDueDiligenceSubmissionGetPayload<{
  include: typeof ERP_DILIGENCE_RECORD_INCLUDE;
}>;

function parseAnswers(value: Prisma.JsonValue) {
  const parsed = ErpDiligenceAnswersSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

function parseProcessSteps(value: Prisma.JsonValue): ErpDiligenceProcessStep[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = ErpDiligenceProcessStepSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

function parseEvidenceItems(
  value: Prisma.JsonValue,
  attachments: ErpDiligenceRecord["evidenceAttachments"] = [],
): ErpDiligenceEvidenceItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = ErpDiligenceEvidenceItemSchema.safeParse(item);
    return parsed.success ? [{
      ...parsed.data,
      attachments: attachments
        .filter((attachment) => attachment.evidenceKey === parsed.data.key)
        .map(toErpDiligenceEvidenceAttachmentDto),
    }] : [];
  });
}

function inferPositionAssignmentId(
  record: ErpDiligenceRecord,
  positionOptions: readonly ErpDiligencePositionOption[],
) {
  if (record.positionAssignmentId) return record.positionAssignmentId;
  const matches = positionOptions.filter((option) => (
    option.positionName === record.roleTitle && option.departmentName === record.departmentName
  ));
  return matches.length === 1 ? matches[0].assignmentId : null;
}

function toDto(
  record: ErpDiligenceRecord,
  positionOptions: readonly ErpDiligencePositionOption[] = [],
): ErpDiligenceSubmissionDto {
  const answers = parseAnswers(record.answersJson);
  const processSteps = parseProcessSteps(record.processStepsJson);
  const evidenceItems = parseEvidenceItems(record.evidenceItemsJson, record.evidenceAttachments);
  const base = {
    id: record.id,
    respondentUserId: record.respondentUserId,
    positionAssignmentId: inferPositionAssignmentId(record, positionOptions),
    respondentName: record.respondentName,
    departmentName: record.departmentName,
    roleTitle: record.roleTitle,
    primaryArea: record.primaryArea,
    status: record.status === "submitted" ? "submitted" as const : "draft" as const,
    answers,
    processSteps,
    evidenceItems,
    campaignKey: record.campaignKey,
    definitionVersion: record.definitionVersion,
    submittedAt: record.submittedAt?.toISOString() ?? null,
    updatedAt: record.updatedAt.toISOString(),
    version: record.version,
  };
  return { ...base, completionPercent: calculateErpDiligenceCompletion(base) };
}

function toPositionOption(assignment: UserActivePositionAssignment): ErpDiligencePositionOption {
  return {
    assignmentId: assignment.id,
    positionId: assignment.positionId,
    positionCode: assignment.positionCode,
    positionName: assignment.positionName,
    departmentId: assignment.departmentId,
    departmentCode: assignment.departmentCode,
    departmentName: assignment.departmentName,
    isPrimary: assignment.isPrimary,
  };
}

async function listResponsibilityPositionOptions(
  assignments: readonly UserActivePositionAssignment[],
): Promise<ErpDiligenceResponsibilityPositionOption[]> {
  const rootDepartmentIds = Array.from(new Set(assignments.map((assignment) => assignment.departmentId)));
  if (rootDepartmentIds.length === 0) return [];
  const activeDateFloor = workspaceBusinessDayStart(new Date());
  const departments = await prisma.department.findMany({
    where: {
      isArchived: false,
      OR: [{ endDate: null }, { endDate: { gte: activeDateFloor } }],
    },
    select: { id: true, parentId: true },
  });
  const childrenByParent = new Map<number | null, number[]>();
  for (const department of departments) {
    const children = childrenByParent.get(department.parentId) ?? [];
    children.push(department.id);
    childrenByParent.set(department.parentId, children);
  }
  const scopeByRoot = new Map<number, Set<number>>();
  for (const rootId of rootDepartmentIds) {
    const scope = new Set<number>([rootId]);
    const queue = [rootId];
    while (queue.length > 0) {
      const parentId = queue.shift();
      if (!parentId) continue;
      for (const childId of childrenByParent.get(parentId) ?? []) {
        if (scope.has(childId)) continue;
        scope.add(childId);
        queue.push(childId);
      }
    }
    scopeByRoot.set(rootId, scope);
  }
  const scopedDepartmentIds = Array.from(new Set(Array.from(scopeByRoot.values()).flatMap((scope) => [...scope])));
  const positions = await prisma.position.findMany({
    where: {
      departmentId: { in: scopedDepartmentIds },
      isArchived: false,
      OR: [{ endDate: null }, { endDate: { gte: activeDateFloor } }],
    },
    select: {
      id: true,
      code: true,
      name: true,
      departmentId: true,
      department: { select: { code: true, name: true } },
    },
    orderBy: [{ departmentId: "asc" }, { code: "asc" }, { id: "asc" }],
  });
  return positions.flatMap((position) => {
    if (!position.departmentId || !position.department) return [];
    const departmentId = position.departmentId;
    const scopeDepartmentIds = rootDepartmentIds.filter((rootId) => scopeByRoot.get(rootId)?.has(departmentId));
    if (scopeDepartmentIds.length === 0) return [];
    return [{
      positionId: position.id,
      positionCode: position.code,
      positionName: position.name,
      departmentId,
      departmentCode: position.department.code,
      departmentName: position.department.name,
      scopeDepartmentIds,
    }];
  });
}

export async function canViewAllErpDiligence(userId: number) {
  return evaluatePermissionAction(userId, VIEW_ALL_RESOURCE, "read");
}

export async function listErpDiligenceWorkspace(input: { userId: number }): Promise<ErpDiligenceWorkspaceDto> {
  const [canViewAll, assignments] = await Promise.all([
    canViewAllErpDiligence(input.userId),
    getUserActivePositionAssignments(input.userId),
  ]);
  const positionOptions = assignments.map(toPositionOption);
  const [submission, submissions, responsibilityPositionOptions] = await Promise.all([
    prisma.erpDueDiligenceSubmission.findUnique({
      where: { campaignKey_respondentUserId: { campaignKey: ERP_DILIGENCE_CAMPAIGN_KEY, respondentUserId: input.userId } },
      include: ERP_DILIGENCE_RECORD_INCLUDE,
    }),
    canViewAll
      ? prisma.erpDueDiligenceSubmission.findMany({
          where: { campaignKey: ERP_DILIGENCE_CAMPAIGN_KEY },
          include: ERP_DILIGENCE_RECORD_INCLUDE,
          orderBy: [{ status: "desc" }, { updatedAt: "desc" }],
        })
      : Promise.resolve([]),
    listResponsibilityPositionOptions(assignments),
  ]);
  return {
    submission: submission ? toDto(submission, positionOptions) : null,
    submissions: submissions.map((record) => toDto(record)),
    positionOptions,
    responsibilityPositionOptions,
    canViewAll,
  };
}

export async function commitErpDiligenceSaveCommand(command: ErpDiligenceSaveCommand) {
  const identity = await getUserEmployeeIdentity(command.userId);
  if (!identity) return serviceError("填报账号不存在", 404);
  const respondentName = businessActorIdentity(identity)?.actorName || identity.username;
  const submittedAt = command.status === "submitted" ? new Date() : null;
  const record = await prisma.$transaction(async (tx) => {
    const saved = await tx.erpDueDiligenceSubmission.upsert({
      where: {
        campaignKey_respondentUserId: {
          campaignKey: command.campaignKey,
          respondentUserId: command.userId,
        },
      },
      create: {
        campaignKey: command.campaignKey,
        definitionVersion: command.definitionVersion,
        respondentUserId: command.userId,
        positionAssignmentId: command.positionAssignmentId,
        departmentId: command.departmentId,
        respondentName,
        departmentName: command.departmentName,
        roleTitle: command.roleTitle,
        primaryArea: command.primaryArea,
        status: command.status,
        answersJson: command.answers,
        processStepsJson: command.processSteps,
        evidenceItemsJson: command.evidenceItems,
        submittedAt,
        editedAt: new Date(),
      },
      update: {
        definitionVersion: command.definitionVersion,
        respondentName,
        positionAssignmentId: command.positionAssignmentId,
        departmentId: command.departmentId,
        departmentName: command.departmentName,
        roleTitle: command.roleTitle,
        primaryArea: command.primaryArea,
        status: command.status,
        answersJson: command.answers,
        processStepsJson: command.processSteps,
        evidenceItemsJson: command.evidenceItems,
        submittedAt,
        editedAt: new Date(),
        version: { increment: 1 },
      },
    });
    const evidenceKeys = parseEvidenceItems(command.evidenceItems as Prisma.JsonValue).map((item) => item.key);
    await tx.erpDueDiligenceEvidenceAttachment.deleteMany({
      where: {
        submissionId: saved.id,
        ...(evidenceKeys.length > 0 ? { evidenceKey: { notIn: evidenceKeys } } : {}),
      },
    });
    return tx.erpDueDiligenceSubmission.findUniqueOrThrow({
      where: { id: saved.id },
      include: ERP_DILIGENCE_RECORD_INCLUDE,
    });
  });
  return serviceOk({ submission: toDto(record) });
}

type SaveCommandInput = { userId: number; body: ErpDiligenceSaveInput };

const saveAdapter = defineBusinessActionCommandAdapter({
  businessActionKey: "administration.erpDiligence.save",
  validatorKey: "packages/administration/server/domain/erp-diligence-validation.buildErpDiligenceSaveCommand",
  commitKey: "packages/administration/server/erp-diligence.commitErpDiligenceSaveCommand",
  validate: async (input: SaveCommandInput) => {
    const assignments = input.body.positionAssignmentId
      ? await getUserActivePositionAssignments(input.userId)
      : [];
    const selectedAssignment = assignments.find((assignment) => assignment.id === input.body.positionAssignmentId) ?? null;
    const responsibilityPositions = selectedAssignment
      ? (await listResponsibilityPositionOptions(assignments)).filter((position) => (
          position.scopeDepartmentIds.includes(selectedAssignment.departmentId)
        ))
      : [];
    const command = buildErpDiligenceSaveCommand(input.body, input.userId, {
      positionSelection: selectedAssignment ? {
        id: selectedAssignment.id,
        departmentId: selectedAssignment.departmentId,
        departmentName: selectedAssignment.departmentName,
        positionName: selectedAssignment.positionName,
      } : null,
      responsibilityPositions,
    });
    return command.ok ? serviceOk(command.data) : serviceError(command.issue.message, command.issue.status || 400);
  },
  commit: commitErpDiligenceSaveCommand,
});

export function executeErpDiligenceSaveCommand(input: SaveCommandInput) {
  return executeDirectBusinessActionCommand({
    command: saveAdapter,
    input,
    context: undefined,
    actorUserId: input.userId,
  });
}

export { ErpDiligenceSaveSchema } from "./erp-diligence-schemas";
