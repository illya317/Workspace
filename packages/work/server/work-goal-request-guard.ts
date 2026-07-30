import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { findActiveWorkGoalApprovalRequest } from "./task-approval-reference-adapter";

export async function assertNoActiveWorkGoalRequest(input: {
  businessActionKey: string | null | undefined;
  subjectId: string | null | undefined;
  includeDraft: boolean;
}) {
  if (!input.businessActionKey?.startsWith("work.tasks.goal.") || !input.subjectId) {
    return serviceOk({ ok: true as const });
  }
  const existing = await findActiveWorkGoalApprovalRequest({
    businessActionKey: input.businessActionKey,
    subjectId: input.subjectId,
    includeDraft: input.includeDraft,
  });
  return existing
    ? serviceError(`已有未结束的目标/结果申请（${existing.id}，${existing.status}），请继续处理原申请`, 409)
    : serviceOk({ ok: true as const });
}
