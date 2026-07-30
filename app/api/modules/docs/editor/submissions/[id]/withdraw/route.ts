import { z } from "zod";

import {
  buildDocsTemplateSubmissionActionRouteCommand,
  executeWithdrawDocsTemplateSubmissionRouteCommand,
} from "@workspace/docs/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { submissionParamsSchema } from "../../route-schemas";

const actionBodySchema = z.object({
  version: z.coerce.number().int().positive().nullable().optional(),
  comment: z.string().nullable().optional(),
}).optional();

export const POST = createCommandRoute({
  paramsSchema: submissionParamsSchema,
  bodySchema: actionBodySchema,
  buildCommand: ({ params, body, user }) => buildDocsTemplateSubmissionActionRouteCommand({
    userId: user.userId,
    requestId: params.id,
    body,
  }),
  action: executeWithdrawDocsTemplateSubmissionRouteCommand,
});
