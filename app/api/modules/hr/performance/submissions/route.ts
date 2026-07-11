import { z } from "zod";

import {
  buildCreateHrPerformanceSubmissionRouteCommand,
  buildListHrPerformanceSubmissionsRouteCommand,
  executeCreateHrPerformanceSubmissionRouteCommand,
  executeListHrPerformanceSubmissionsRouteCommand,
} from "@workspace/hr/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const submissionsQuerySchema = z.object({
  status: z.string().optional(),
});

const payloadSchema = z.object({}).passthrough();

const createSubmissionSchema = z.object({
  employeeId: z.coerce.number(),
  okrCycleId: z.coerce.number(),
  payload: payloadSchema.optional(),
  comment: z.string().nullable().optional(),
});

export const GET = createCommandRoute({
  querySchema: submissionsQuerySchema,
  queryError: "流程查询参数无效",
  buildCommand: ({ query, user }) => buildListHrPerformanceSubmissionsRouteCommand({
    userId: user.userId,
    query,
  }),
  action: executeListHrPerformanceSubmissionsRouteCommand,
});

export const POST = createCommandRoute({
  bodySchema: createSubmissionSchema,
  bodyError: "流程草稿参数无效",
  buildCommand: ({ body, user }) => buildCreateHrPerformanceSubmissionRouteCommand({
    userId: user.userId,
    body,
  }),
  action: executeCreateHrPerformanceSubmissionRouteCommand,
});
