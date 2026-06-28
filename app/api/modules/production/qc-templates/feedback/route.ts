import { z } from "zod";

import {
  buildQcTemplateFeedbackListCommand,
  buildQcTemplateFeedbackResolveCommand,
  buildQcTemplateFeedbackSaveCommand,
  executeQcTemplateFeedbackListCommand,
  executeQcTemplateFeedbackResolveCommand,
  executeQcTemplateFeedbackSaveCommand,
} from "@workspace/production/server/qc";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const feedbackQuerySchema = z.object({
  key: z.string().trim().optional(),
}).passthrough();

const saveFeedbackSchema = z.object({
  context: z.unknown(),
  sections: z.unknown().optional(),
  note: z.unknown().optional(),
  inlineEntry: z.unknown().optional(),
}).passthrough();

const updateFeedbackResolvedSchema = z.object({
  key: z.coerce.string().trim().min(1),
  resolved: z.unknown().optional(),
  targetType: z.string().optional(),
  targetId: z.coerce.string().optional(),
}).passthrough();

export const GET = createCommandRoute({
  querySchema: feedbackQuerySchema,
  queryError: "参数错误",
  buildCommand: ({ query, user }) => buildQcTemplateFeedbackListCommand({
    key: query.key,
    userId: user.userId,
  }),
  action: executeQcTemplateFeedbackListCommand,
});

export const POST = createCommandRoute({
  bodySchema: saveFeedbackSchema,
  bodyError: "参数错误",
  buildCommand: ({ body, user }) => buildQcTemplateFeedbackSaveCommand({
    userId: user.userId,
    userName: user.nickname,
    body,
  }),
  action: executeQcTemplateFeedbackSaveCommand,
});

export const PATCH = createCommandRoute({
  bodySchema: updateFeedbackResolvedSchema,
  bodyError: "缺少反馈 key",
  buildCommand: ({ body, user }) => buildQcTemplateFeedbackResolveCommand({
    userId: user.userId,
    userName: user.nickname,
    body,
  }),
  action: executeQcTemplateFeedbackResolveCommand,
});
