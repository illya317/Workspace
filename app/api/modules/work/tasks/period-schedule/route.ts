import { z } from "zod";

import {
  buildCreateWorkPeriodScheduleItemRouteCommand,
  executeCreateWorkPeriodScheduleItemRouteCommand,
} from "@workspace/work/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const createPeriodScheduleItemSchema = z.object({
  rootPlanId: z.coerce.number().int().positive(),
  cycleId: z.coerce.number().int().positive(),
  sourceItemId: z.coerce.number().int().positive(),
  itemType: z.enum(["objective", "key_result"]),
  content: z.string().min(1),
  description: z.string().nullable().optional(),
  status: z.enum(["active", "paused", "done"]).nullable().optional(),
  importance: z.coerce.number().nullable().optional(),
  urgency: z.coerce.number().nullable().optional(),
  ownerEmployeeId: z.coerce.number().nullable().optional(),
  actualStartDate: z.string().nullable().optional(),
  actualEndDate: z.string().nullable().optional(),
  plannedStartDate: z.string().nullable().optional(),
  plannedEndDate: z.string().nullable().optional(),
  responsibilityPositionId: z.coerce.number().nullable().optional(),
  responsibilityNodeId: z.coerce.number().nullable().optional(),
  krUnit: z.string().nullable().optional(),
});

export const POST = createCommandRoute({
  bodySchema: createPeriodScheduleItemSchema,
  bodyError: "时间安排参数无效",
  buildCommand: ({ body, user }) => buildCreateWorkPeriodScheduleItemRouteCommand({
    user,
    body,
  }),
  action: executeCreateWorkPeriodScheduleItemRouteCommand,
});
