import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import {
  normalizeWorkTargetType,
  type WorkSpaceTargetType,
} from "./access";

export async function assertWorkTaskDirectUpdateAllowed(input: {
  actorUserId: number;
  targetType: WorkSpaceTargetType | string;
  targetId: number;
  businessActionKey: string;
}) {
  const targetType = normalizeWorkTargetType(input.targetType);
  const businessActionKey = input.businessActionKey;
  return assertBusinessActionDirectExecutionAllowed({
    businessActionKey,
    actorUserId: input.actorUserId,
    workflowApplicable: targetType === "company" || targetType === "committee" || targetType === "department" || targetType === "project",
    scopeType: targetType,
    scopeId: input.targetId,
    defaults: {
      businessActionKey,
      mode: "optional",
      flowType: "approval",
      separationPolicy: "auto_pass_if_authorized",
      handlerSource: "permission",
    },
    blockedMessage: "该行为已配置为必须走流程，请提交审核",
  });
}
