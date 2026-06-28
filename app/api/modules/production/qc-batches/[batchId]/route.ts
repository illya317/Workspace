import { z } from "zod";

import {
  buildQcBatchIdCommand,
  buildQcBatchPatchCommand,
  executeDeleteQcBatchCommand,
  executeGetQcBatchCommand,
  executeQcBatchPatchCommand,
} from "@workspace/production/server/qc";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const paramsSchema = z.object({
  batchId: z.coerce.number().int().positive(),
});

const updateQcBatchSchema = z.object({
  action: z.enum(["save_inspection", "approve_review"]).optional(),
  stageKey: z.string().optional(),
  testName: z.string().optional(),
  batchNumber: z.string().optional(),
  inspector: z.string().optional(),
  fields: z.unknown().optional(),
}).passthrough();

export const GET = createCommandRoute({
  paramsSchema,
  paramsError: "无效批次 ID",
  buildCommand: ({ params }) => buildQcBatchIdCommand(params.batchId),
  action: executeGetQcBatchCommand,
});

export const PATCH = createCommandRoute({
  paramsSchema,
  paramsError: "无效批次 ID",
  bodySchema: updateQcBatchSchema,
  bodyError: "参数错误",
  buildCommand: ({ params, body, user }) => buildQcBatchPatchCommand({
    batchId: params.batchId,
    userId: user.userId,
    userName: user.nickname,
    body,
  }),
  action: executeQcBatchPatchCommand,
});

export const DELETE = createCommandRoute({
  paramsSchema,
  paramsError: "无效批次 ID",
  buildCommand: ({ params }) => buildQcBatchIdCommand(params.batchId),
  action: executeDeleteQcBatchCommand,
});
