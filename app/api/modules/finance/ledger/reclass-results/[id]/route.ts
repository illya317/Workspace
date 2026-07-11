import { z } from "zod";

import {
  buildReclassResultPatchCommand,
  executeReclassResultPatchCommand,
} from "@workspace/finance/server/route-commands";
import { reclassResultIdSchema } from "@workspace/finance/server/ledger/reclass-results/schemas";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const reclassResultPatchBodySchema = z.object({}).passthrough();

export const PATCH = createCommandRoute({
  paramsSchema: reclassResultIdSchema,
  paramsError: "无效的 ID",
  bodySchema: reclassResultPatchBodySchema,
  bodyError: "请求体格式错误",
  buildCommand: ({ params, body, user }) => buildReclassResultPatchCommand({
    id: params.id,
    body,
    userId: user.userId,
  }),
  action: executeReclassResultPatchCommand,
});
