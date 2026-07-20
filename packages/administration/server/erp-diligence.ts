import { calculateErpDiligenceCompletion } from "@workspace/administration/constants";
import {
  ERP_DILIGENCE_CAMPAIGN_KEY,
  type ErpDiligenceEvidenceItem,
  type ErpDiligenceProcessStep,
  type ErpDiligenceSubmissionDto,
  type ErpDiligenceWorkspaceDto,
} from "@workspace/administration/types";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { evaluatePermissionAction } from "@workspace/platform/server/auth";
import {
  defineBusinessActionCommandAdapter,
  executeDirectBusinessActionCommand,
} from "@workspace/platform/server/business-action-executor";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { buildErpDiligenceSaveCommand, type ErpDiligenceSaveCommand } from "./domain/erp-diligence-validation";
import {
  ErpDiligenceAnswersSchema,
  ErpDiligenceEvidenceItemSchema,
  ErpDiligenceProcessStepSchema,
  type ErpDiligenceSaveInput,
} from "./erp-diligence-schemas";

const VIEW_ALL_RESOURCE = "administration.erpDiligence.viewAll";

type ErpDiligenceRecord = Prisma.ErpDueDiligenceSubmissionGetPayload<Record<string, never>>;

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

function parseEvidenceItems(value: Prisma.JsonValue): ErpDiligenceEvidenceItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = ErpDiligenceEvidenceItemSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

function toDto(record: ErpDiligenceRecord): ErpDiligenceSubmissionDto {
  const answers = parseAnswers(record.answersJson);
  const processSteps = parseProcessSteps(record.processStepsJson);
  const evidenceItems = parseEvidenceItems(record.evidenceItemsJson);
  const base = {
    id: record.id,
    respondentUserId: record.respondentUserId,
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

export async function canViewAllErpDiligence(userId: number) {
  return evaluatePermissionAction(userId, VIEW_ALL_RESOURCE, "read");
}

export async function listErpDiligenceWorkspace(input: { userId: number }): Promise<ErpDiligenceWorkspaceDto> {
  const canViewAll = await canViewAllErpDiligence(input.userId);
  const [submission, submissions] = await Promise.all([
    prisma.erpDueDiligenceSubmission.findUnique({
      where: { campaignKey_respondentUserId: { campaignKey: ERP_DILIGENCE_CAMPAIGN_KEY, respondentUserId: input.userId } },
    }),
    canViewAll
      ? prisma.erpDueDiligenceSubmission.findMany({
          where: { campaignKey: ERP_DILIGENCE_CAMPAIGN_KEY },
          orderBy: [{ status: "desc" }, { updatedAt: "desc" }],
        })
      : Promise.resolve([]),
  ]);
  return {
    submission: submission ? toDto(submission) : null,
    submissions: submissions.map(toDto),
    canViewAll,
  };
}

export async function commitErpDiligenceSaveCommand(command: ErpDiligenceSaveCommand) {
  const user = await prisma.user.findUnique({
    where: { id: command.userId },
    select: {
      username: true,
      employees: { select: { name: true }, orderBy: { id: "desc" }, take: 1 },
    },
  });
  if (!user) return serviceError("填报账号不存在", 404);
  const respondentName = user.employees[0]?.name?.trim() || user.username;
  const submittedAt = command.status === "submitted" ? new Date() : null;
  const record = await prisma.erpDueDiligenceSubmission.upsert({
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
  return serviceOk({ submission: toDto(record) });
}

type SaveCommandInput = { userId: number; body: ErpDiligenceSaveInput };

const saveAdapter = defineBusinessActionCommandAdapter({
  businessActionKey: "administration.erpDiligence.save",
  validatorKey: "packages/administration/server/domain/erp-diligence-validation.buildErpDiligenceSaveCommand",
  commitKey: "packages/administration/server/erp-diligence.commitErpDiligenceSaveCommand",
  validate: (input: SaveCommandInput) => {
    const command = buildErpDiligenceSaveCommand(input.body, input.userId);
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
