import { prisma } from "@workspace/platform/server/prisma";

export async function findApprovalProjectPhaseReference(phaseId: number) {
  return prisma.projectPlanPhase.findUnique({ where: { id: phaseId }, select: { projectId: true } });
}

export async function findActiveWorkGoalApprovalRequest(input: {
  businessActionKey: string;
  subjectId: string;
  includeDraft: boolean;
}) {
  return prisma.approvalRequest.findFirst({
    where: {
      subjectType: "work.task",
      subjectId: input.subjectId,
      businessActionKey: input.businessActionKey,
      status: { in: input.includeDraft ? ["draft", "submitted", "committing"] : ["submitted", "committing"] },
    },
    select: { id: true, status: true },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });
}
