import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { prisma } from "@workspace/platform/server/prisma";

export async function assertNoActiveWorkGoalRequest(input: {
  businessActionKey: string | null | undefined;
  subjectId: string | null | undefined;
  includeDraft: boolean;
}) {
  if (!input.businessActionKey?.startsWith("work.tasks.goal.") || !input.subjectId) {
    return serviceOk({ ok: true as const });
  }
  const existing = await prisma.approvalRequest.findFirst({
    where: {
      subjectType: "work.task",
      subjectId: input.subjectId,
      businessActionKey: input.businessActionKey,
      status: { in: input.includeDraft ? ["draft", "submitted", "committing"] : ["submitted", "committing"] },
    },
    select: { id: true, status: true },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });
  return existing
    ? serviceError(`已有未结束的目标/结果申请（${existing.id}，${existing.status}），请继续处理原申请`, 409)
    : serviceOk({ ok: true as const });
}
