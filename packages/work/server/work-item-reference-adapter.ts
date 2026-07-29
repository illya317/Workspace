import { prisma } from "@workspace/platform/server/prisma";

export async function findWorkPlanRelationReference(planId: number) {
  return prisma.workPlan.findUnique({
    where: { id: planId },
    select: { targetType: true, targetId: true, kind: true, collaborationId: true, status: true, isArchived: true },
  });
}

export async function findProjectRelationReference(projectId: number) {
  return prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
}

export async function findProjectPhaseRelationReference(phaseId: number) {
  return prisma.projectPlanPhase.findUnique({ where: { id: phaseId }, select: { id: true, projectId: true } });
}

export async function findParentWorkItemReference(workItemId: number) {
  return prisma.workItem.findUnique({
    where: { id: workItemId },
    select: {
      id: true,
      targetType: true,
      targetId: true,
      planId: true,
      itemType: true,
      parentWorkItemId: true,
      routineTaskType: true,
      status: true,
      isArchived: true,
    },
  });
}

export async function findWorkItemParentId(workItemId: number) {
  return prisma.workItem.findUnique({ where: { id: workItemId }, select: { parentWorkItemId: true } });
}

export async function findMeetingReference(meetingId: number) {
  return prisma.meeting.findUnique({ where: { id: meetingId }, select: { id: true } });
}

export async function findMeetingDecisionReference(decisionId: number) {
  return prisma.meetingDecision.findUnique({ where: { id: decisionId }, select: { meetingId: true } });
}

export async function findMeetingActionCandidateReference(candidateId: number) {
  return prisma.meetingActionCandidate.findUnique({ where: { id: candidateId }, select: { meetingId: true } });
}
