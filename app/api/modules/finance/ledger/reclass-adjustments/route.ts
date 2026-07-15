import { z } from "zod";

import {
  buildSaveBalanceReclassAdjustmentChangeSetRouteCommand,
  executeSaveBalanceReclassAdjustmentChangeSetRouteCommand,
} from "@workspace/finance/server/route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const saveAdjustmentsSchema = z.object({
  changes: z.array(z.object({
    periodId: z.number().int().positive(),
    sourceAccountCode: z.string().min(1),
    targetAccountCode: z.string().min(1),
  })).min(1).max(500),
});

export const PUT = createCommandRoute({
  bodySchema: saveAdjustmentsSchema,
  bodyError: "changes 为必填",
  buildCommand: ({ body, user }) => buildSaveBalanceReclassAdjustmentChangeSetRouteCommand({ ...body, userId: user.userId }),
  action: executeSaveBalanceReclassAdjustmentChangeSetRouteCommand,
});
