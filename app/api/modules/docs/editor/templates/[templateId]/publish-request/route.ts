import { z } from "zod";
import { requestPublish } from "@workspace/platform/server/docs-editor";
import { createApiRouteHandler } from "@workspace/platform/server/api-route";

const templateParamsSchema = z.object({
  templateId: z.string().min(1),
});

const emptyBodySchema = z.object({});

export const POST = createApiRouteHandler({
  paramsSchema: templateParamsSchema,
  bodySchema: emptyBodySchema,
  optionalJsonBody: true,
  handler: ({ user, params }) => requestPublish({
    userId: user.userId,
    templateId: params.templateId,
  }),
});
