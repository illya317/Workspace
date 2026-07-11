import { z } from "zod";

import {
  buildCreateHrDepartmentSubmissionRouteCommand,
  buildListHrDepartmentSubmissionsRouteCommand,
  executeCreateHrDepartmentSubmissionRouteCommand,
  executeListHrDepartmentSubmissionsRouteCommand,
} from "@workspace/hr/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const submissionsQuerySchema = z.object({
  status: z.string().optional(),
});

const payloadSchema = z.object({}).passthrough();

const createSubmissionSchema = z.object({
  operation: z.enum(["create", "update"]),
  departmentId: z.coerce.number().nullable().optional(),
  payload: payloadSchema,
  comment: z.string().nullable().optional(),
});

export const GET = createCommandRoute({
  querySchema: submissionsQuerySchema,
  queryError: "流程查询参数无效",
  buildCommand: ({ query, user }) => buildListHrDepartmentSubmissionsRouteCommand({
    userId: user.userId,
    query,
  }),
  action: executeListHrDepartmentSubmissionsRouteCommand,
});

export const POST = createCommandRoute({
  bodySchema: createSubmissionSchema,
  bodyError: "流程草稿参数无效",
  buildCommand: ({ body, user }) => buildCreateHrDepartmentSubmissionRouteCommand({
    userId: user.userId,
    body,
  }),
  action: executeCreateHrDepartmentSubmissionRouteCommand,
});
