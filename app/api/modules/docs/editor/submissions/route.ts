import { z } from "zod";

import {
  buildCreateDocsTemplateSubmissionRouteCommand,
  buildListDocsTemplateSubmissionsRouteCommand,
  executeCreateDocsTemplateSubmissionRouteCommand,
  executeListDocsTemplateSubmissionsRouteCommand,
} from "@workspace/docs/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const optionalNumber = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? undefined : Number(value)),
  z.number().optional(),
);

const submissionsQuerySchema = z.object({
  targetType: z.string().optional(),
  targetId: optionalNumber,
  status: z.string().optional(),
});

const payloadSchema = z.object({}).passthrough();

const createSubmissionSchema = z.object({
  action: z.enum(["draft.create", "draft.save", "publish", "create"]).nullable().optional(),
  operation: z.enum(["create", "update"]).nullable().optional(),
  targetType: z.string().nullable().optional(),
  targetId: z.coerce.number().nullable().optional(),
  templateId: z.coerce.number().nullable().optional(),
  payload: payloadSchema,
  comment: z.string().nullable().optional(),
});

export const GET = createCommandRoute({
  querySchema: submissionsQuerySchema,
  queryError: "流程查询参数无效",
  buildCommand: ({ query, user }) => buildListDocsTemplateSubmissionsRouteCommand({
    userId: user.userId,
    query,
  }),
  action: executeListDocsTemplateSubmissionsRouteCommand,
});

export const POST = createCommandRoute({
  bodySchema: createSubmissionSchema,
  bodyError: "流程草稿参数无效",
  buildCommand: ({ body, user }) => buildCreateDocsTemplateSubmissionRouteCommand({
    userId: user.userId,
    body,
  }),
  action: executeCreateDocsTemplateSubmissionRouteCommand,
});
