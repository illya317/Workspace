import { z } from "zod";

import {
  buildQcBatchApproveReviewCommand,
  executeQcBatchPatchCommand,
  qcRequestAuthMethod,
} from "@workspace/production/server/qc";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const paramsSchema = z.object({
  batchId: z.coerce.number().int().positive(),
});

const approveReviewSchema = z.object({
  stageKey: z.string().min(1),
  testName: z.string().min(1).optional(),
  expectedVersion: z.number().int().positive(),
});

export const POST = createCommandRoute({
  paramsSchema,
  paramsError: "无效批次 ID",
  bodySchema: approveReviewSchema,
  bodyError: "参数错误",
  buildCommand: ({ params, body, user, request }) => buildQcBatchApproveReviewCommand({
    batchId: params.batchId,
    userId: user.userId,
    authMethod: qcRequestAuthMethod(request),
    body,
  }),
  action: executeQcBatchPatchCommand,
});
