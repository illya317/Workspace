import { z } from "zod";
import { readRequestExpectedVersion } from "@workspace/platform/server/api";
import { failCommand, okCommand } from "@workspace/platform/server/domain-validation";

import {
  buildHrRouteCommand,
  executePositionDescriptionQuery,
  updatePositionDescription,
} from "@workspace/hr/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";const positionDescriptionQuerySchema = z.object({
  code: z.string().optional(),
  id: z.string().optional(),
  positionId: z.string().optional(),
  tree: z.string().optional(),
  search: z.string().optional(),
  asOf: z.string().optional(),
});

const updatePositionDescriptionSchema = z.object({
  id: z.unknown().optional(),
  headcount: z.unknown().optional(),
  details: z.unknown().optional(),
}).passthrough();

export const GET = createCommandRoute({
  querySchema: positionDescriptionQuerySchema,
  buildCommand: ({ query }) => buildHrRouteCommand(query),
  action: executePositionDescriptionQuery,
});

export const PUT = createCommandRoute({
  bodySchema: updatePositionDescriptionSchema,
  bodyError: "参数错误",
  buildCommand: ({ body, user, request }) => {
    const revisionUid = request.headers.get("idempotency-key")?.trim();
    const expectedSequence = readRequestExpectedVersion(request);
    if (!revisionUid) return failCommand("缺少 Idempotency-Key 请求头");
    if (expectedSequence === undefined) return failCommand("缺少 If-Match 当前修订序号", 409);
    return okCommand({ body: { ...body, revisionUid, expectedSequence }, userId: user.userId });
  },
  action: ({ body, userId }) => updatePositionDescription(body, userId),
});
