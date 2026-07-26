import { z } from "zod";
import { isProductionBatchNumber, PRODUCTION_BATCH_NUMBER_MESSAGE } from "@workspace/platform/production-batch-number";

import {
  buildQcBatchIdCommand,
  buildQcBatchPatchCommand,
  buildDeleteQcBatchRouteCommand,
  executeDeleteQcBatchCommand,
  executeGetQcBatchCommand,
  executeQcBatchPatchCommand,
  qcRequestAuthMethod,
} from "@workspace/production/server/qc";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const paramsSchema = z.object({
  batchId: z.coerce.number().int().positive(),
});

const updateQcBatchSchema = z.object({
  action: z.enum(["save_precheck", "save_inspection"]).optional(),
  stageKey: z.string().optional(),
  testName: z.string().optional(),
  batchNumber: z.string().trim().refine(isProductionBatchNumber, PRODUCTION_BATCH_NUMBER_MESSAGE).optional(),
  expectedVersion: z.number().int().positive(),
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
  buildCommand: ({ params, body, user, request }) => buildQcBatchPatchCommand({
    batchId: params.batchId,
    userId: user.userId,
    authMethod: qcRequestAuthMethod(request),
    body,
  }),
  action: executeQcBatchPatchCommand,
});

export const DELETE = createCommandRoute({
  paramsSchema,
  paramsError: "无效批次 ID",
  bodySchema: z.object({ expectedVersion: z.number().int().positive() }),
  bodyError: "缺少有效的批次版本",
  buildCommand: ({ params, body, user }) => buildDeleteQcBatchRouteCommand({
    batchId: params.batchId,
    expectedVersion: body.expectedVersion,
    userId: user.userId,
  }),
  action: executeDeleteQcBatchCommand,
});
