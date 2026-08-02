import { z } from "zod";

import {
  ContractAttachmentRemoveSchema,
  executeRemoveContractAttachment,
} from "@workspace/administration/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
  attachmentUid: z.string().uuid(),
});

export const POST = createCommandRoute({
  paramsSchema,
  paramsError: "附件标识无效",
  bodySchema: ContractAttachmentRemoveSchema,
  buildCommand: ({ params, body, user }) => okCommand({
    contractId: params.id,
    attachmentUid: params.attachmentUid,
    body,
    userId: user.userId,
  }),
  action: executeRemoveContractAttachment,
});
