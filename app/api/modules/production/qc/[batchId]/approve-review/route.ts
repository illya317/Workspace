import { z } from "zod";

import {
  buildQcBatchPatchCommand,
  executeQcBatchPatchCommand,
} from "@workspace/production/server/qc";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const paramsSchema = z.object({
  batchId: z.coerce.number().int().positive(),
});

const approveReviewSchema = z.object({
  stageKey: z.string().min(1),
  testName: z.string().min(1),
});

export const POST = createCommandRoute({
  paramsSchema,
  paramsError: "无效批次 ID",
  bodySchema: approveReviewSchema,
  bodyError: "参数错误",
  buildCommand: ({ params, body, user }) => buildQcBatchPatchCommand({
    batchId: params.batchId,
    userId: user.userId,
    userName: user.nickname,
    body: {
      action: "approve_review",
      stageKey: body.stageKey,
      testName: body.testName,
    },
  }),
  action: executeQcBatchPatchCommand,
});
