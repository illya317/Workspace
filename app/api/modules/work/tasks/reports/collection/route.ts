import { z } from "zod";

import { executeWorkReportCollectionRouteCommand } from "@workspace/work/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

const reportCollectionQuerySchema = z.object({
  periodStart: z.string().nullable().optional(),
});

export const GET = createCommandRoute({
  querySchema: reportCollectionQuerySchema,
  buildCommand: ({ query, user }) => okCommand({
    userId: user.userId,
    periodStart: query.periodStart ?? null,
  }),
  action: executeWorkReportCollectionRouteCommand,
});
