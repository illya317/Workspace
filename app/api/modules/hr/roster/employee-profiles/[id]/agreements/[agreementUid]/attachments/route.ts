import {
  EmploymentAgreementAttachmentParamsSchema,
  EmploymentAgreementAttachmentUploadSchema,
  executeUploadEmploymentAgreementAttachment,
} from "@workspace/hr/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

export const POST = createCommandRoute({
  paramsSchema: EmploymentAgreementAttachmentParamsSchema,
  paramsError: "员工或协议标识无效",
  bodyParser: "formData",
  bodySchema: EmploymentAgreementAttachmentUploadSchema,
  bodyError: "协议附件参数无效",
  buildCommand: ({ params, body, user }) => okCommand({
    employeeId: params.id,
    agreementUid: params.agreementUid,
    userId: user.userId,
    ...body,
  }),
  action: executeUploadEmploymentAgreementAttachment,
});
