import { prisma } from "@workspace/platform/server/prisma";
import type { ActionRuntimeRequestSnapshot } from "@workspace/platform/workflow-action-runtime";
import { approvalPayloadReferencesWorkPlan } from "./domain/work-plan-governance-validation";
import { workOkrRequestBindingPriority } from "./domain/work-okr-governance-policy";
import {
  workOkrWorkflowBusinessActionKey,
  type WorkOkrWorkflowActionKind,
} from "./task-approval-helpers";

export type WorkPlanActionRuntimeRequests = Partial<Record<
  WorkOkrWorkflowActionKind,
  ActionRuntimeRequestSnapshot
>>;

const ACTION_KINDS: WorkOkrWorkflowActionKind[] = [
  "objective_submit",
  "objective_revise",
  "report_submit",
  "report_correct",
];

export async function listWorkPlanActionRuntimeRequests(
  plans: readonly { id: number; targetType: string }[],
): Promise<Map<number, WorkPlanActionRuntimeRequests>> {
  const requestsByPlanId = new Map<number, WorkPlanActionRuntimeRequests>();
  if (!plans.length) return requestsByPlanId;
  const planIds = plans.map((plan) => plan.id);
  const requests = await prisma.approvalRequest.findMany({
    where: {
      subjectType: "work.task",
      status: { in: ["draft", "submitted", "committing", "withdrawn", "rejected"] },
      businessActionKey: { startsWith: "work.tasks.goal." },
      OR: planIds.flatMap((planId) => [
        { subjectId: String(planId) },
        { subjectId: `revision:plan:${planId}` },
        { latestPayloadJson: { contains: `"planId":${planId}` } },
        { latestPayloadJson: { contains: `"workPlanId":${planId}` } },
      ]),
    },
    select: {
      id: true,
      businessActionKey: true,
      subjectId: true,
      status: true,
      latestPayloadJson: true,
      submitterUserId: true,
      handlerCanRevise: true,
      requestCanWithdraw: true,
      requestCanResubmit: true,
      requestCanCancel: true,
      requestCanRevise: true,
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });
  const prioritizedRequests = [...requests].sort((left, right) => (
    workOkrRequestBindingPriority(right.status) - workOkrRequestBindingPriority(left.status)
      || right.id - left.id
  ));
  for (const request of prioritizedRequests) {
    for (const plan of plans) {
      if (!requestReferencesPlan(request, plan.id)) continue;
      const kind = ACTION_KINDS.find((candidate) => (
        workOkrWorkflowBusinessActionKey({
          kind: candidate,
          workspaceTargetType: plan.targetType,
        }) === request.businessActionKey
      ));
      if (!kind) continue;
      const planRequests = requestsByPlanId.get(plan.id) ?? {};
      if (planRequests[kind]) continue;
      planRequests[kind] = toRuntimeRequest(request);
      requestsByPlanId.set(plan.id, planRequests);
    }
  }
  return requestsByPlanId;
}

function toRuntimeRequest(request: {
  id: number;
  status: string;
  submitterUserId: number;
  handlerCanRevise: boolean;
  requestCanWithdraw: boolean;
  requestCanResubmit: boolean;
  requestCanCancel: boolean;
  requestCanRevise: boolean;
}): ActionRuntimeRequestSnapshot {
  return {
    id: request.id,
    status: request.status as ActionRuntimeRequestSnapshot["status"],
    submitterUserId: request.submitterUserId,
    handlerCanRevise: request.handlerCanRevise,
    requestCanWithdraw: request.requestCanWithdraw,
    requestCanResubmit: request.requestCanResubmit,
    requestCanCancel: request.requestCanCancel,
    requestCanRevise: request.requestCanRevise,
  };
}

function requestReferencesPlan(
  request: { subjectId: string | null; latestPayloadJson: string },
  planId: number,
) {
  return request.subjectId === String(planId)
    || request.subjectId === `revision:plan:${planId}`
    || approvalPayloadReferencesWorkPlan(request.latestPayloadJson, planId);
}
