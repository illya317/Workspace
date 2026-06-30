import { z } from "zod";
import { requestPublish } from "@workspace/platform/server/docs-editor";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

const templateParamsSchema = z.object({
  templateId: z.string().min(1),
});

const emptyBodySchema = z.object({});

export const POST = createCommandRoute({
  paramsSchema: templateParamsSchema,
  bodySchema: emptyBodySchema,
  optionalJsonBody: true,
  buildCommand: ({ user, params }) => okCommand({
    userId: user.userId,
    templateId: params.templateId,
  }),
  action: (command) => requestPublish(command),
});
