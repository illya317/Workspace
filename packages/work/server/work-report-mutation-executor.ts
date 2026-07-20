import {
  defineBusinessActionCommandAdapter,
  executeBusinessActionCommand,
} from "@workspace/platform/server/business-action-executor";
import type { ApprovalPreparedPayload } from "@workspace/platform/server/approvals";
import { serviceOk } from "@workspace/platform/server/api";
import { prisma } from "@workspace/platform/server/prisma";
import { canUpdateWorkTaskAction } from "./access";
import { workTaskApprovalAdapter } from "./task-approval-adapter";
import type { WorkTaskReportApprovalPayload } from "./task-approval-helpers";
import {
  commitWorkReportApproval,
  validateReportApprovalPayload,
} from "./task-approval-reports";
import type { SaveWorkReportRouteCommand } from "./work-task-route-command";
import {
  workReportBusinessActionKey,
  workReportWorkflowApplicable,
} from "./work-report-action-runtime";
import { assertNoActiveWorkGoalRequest } from "./work-goal-request-guard";

type WorkReportCommandContext = { actorUserId: number; submitterUserId: number };
type WorkReportCommandResult = { entityType: string; entityId: string; entity: unknown };

export async function executeSaveWorkReportRouteCommand(
  command: SaveWorkReportRouteCommand,
) {
  const reportStage = command.reportStage === "kr" ? "kr" : "final";
  const periodType = normalizePeriodType(command.periodType);
  const existingReport = await findExistingReport(command, periodType, reportStage);
  const businessActionKey = workReportBusinessActionKey(
    command.targetType,
    reportStage,
    periodType,
    Boolean(existingReport),
  );
  const payload = {
    entityType: "report" as const,
    targetType: command.targetType,
    targetId: command.targetId,
    reportId: existingReport?.id ?? null,
    periodType,
    periodStart: command.periodStart ?? null,
    reportStage,
    data: {
      periodType,
      periodStart: command.periodStart ?? null,
      reportStage,
      items: command.items,
    },
  } as unknown as WorkTaskReportApprovalPayload;
  const duplicateGuard = await assertNoActiveWorkGoalRequest({
    businessActionKey,
    subjectId: `report:${command.targetType}:${command.targetId}:${periodType}:${command.periodStart}:${reportStage}`,
    includeDraft: false,
  });
  if (!duplicateGuard.ok) return duplicateGuard;
  const reportCommand = defineBusinessActionCommandAdapter<
    WorkTaskReportApprovalPayload,
    ApprovalPreparedPayload<WorkTaskReportApprovalPayload>,
    WorkReportCommandResult,
    WorkReportCommandContext
  >({
    businessActionKey,
    validatorKey: "packages/work/server/task-approval-reports.validateReportApprovalPayload",
    commitKey: "packages/work/server/task-approval-reports.commitWorkReportApproval",
    validate: (input) => validateReportApprovalPayload(input),
    commit: (prepared, context) => commitWorkReportApproval({
      actorUserId: context.actorUserId,
      submitterUserId: context.submitterUserId,
      payload: prepared.payload,
      authorization: "direct",
    }),
  });
  const actorUserId = command.actorUserId ?? command.userId;
  const result = await executeBusinessActionCommand({
    command: reportCommand,
    input: payload,
    context: { actorUserId, submitterUserId: command.userId },
    actorUserId,
    // The platform executor invokes this guard only for the direct commit branch.
    // Workflow entry is authorized by workTaskApprovalAdapter.createDraft (submit).
    authorize: () => canUpdateWorkTaskAction(
        actorUserId,
        command.targetType,
        command.targetId,
      ),
    forbiddenMessage: "无权限填写目标/考核表",
    workflow: {
      applicable: workReportWorkflowApplicable(periodType),
      adapter: workTaskApprovalAdapter,
      operation: "update",
      prepare: (prepared) => prepared,
    },
  });
  if (!result.ok) return result;
  return result.data.executionMode === "direct"
    ? serviceOk({ executionMode: "direct" as const, report: result.data.result.entity })
    : serviceOk({ executionMode: "workflow" as const, request: result.data.request });
}

async function findExistingReport(
  command: SaveWorkReportRouteCommand,
  periodType: string,
  reportStage: "kr" | "final",
) {
  if (!command.periodStart) return null;
  const periodStart = new Date(command.periodStart);
  if (Number.isNaN(periodStart.getTime())) return null;
  return prisma.workReport.findUnique({
    where: {
      targetType_targetId_periodType_periodStart_reportStage: {
        targetType: command.targetType,
        targetId: command.targetId,
        periodType,
        periodStart,
        reportStage,
      },
    },
    select: { id: true },
  });
}

function normalizePeriodType(value: string | null | undefined) {
  if (value === "monthly" || value === "quarterly" || value === "half_year" || value === "yearly") {
    return value;
  }
  return "weekly";
}
