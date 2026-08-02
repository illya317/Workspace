import {
  EmploymentAgreementAttachmentRemoveSchema,
  EmploymentAgreementAttachmentTargetParamsSchema,
  executeRemoveEmploymentAgreementAttachment,
} from "@workspace/hr/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

export const POST = createCommandRoute({
  paramsSchema: EmploymentAgreementAttachmentTargetParamsSchema,
  paramsError: "员工、协议或附件标识无效",
  bodySchema: EmploymentAgreementAttachmentRemoveSchema,
  bodyError: "附件移除参数无效",
  buildCommand: ({ params, body, user }) => okCommand({
    employeeId: params.id,
    agreementUid: params.agreementUid,
    attachmentUid: params.attachmentUid,
    userId: user.userId,
    reason: body.reason,
  }),
  action: executeRemoveEmploymentAgreementAttachment,
});
