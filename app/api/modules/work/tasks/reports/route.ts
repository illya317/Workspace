import { z } from "zod";

import {
  buildSaveWorkReportRouteCommand,
  buildWorkReportRouteCommand,
  executeGetWorkReportRouteCommand,
  executeSaveWorkReportRouteCommand,
} from "@workspace/work/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const optionalPositiveInt = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? undefined : Number(value)),
  z.number().int().positive().optional(),
);

const reportQuerySchema = z.object({
  targetType: z.string().optional(),
  targetId: optionalPositiveInt,
  periodStart: z.string().nullable().optional(),
});

const saveSchema = z.object({
  targetType: z.string(),
  targetId: z.coerce.number().int().positive(),
  periodStart: z.string().nullable().optional(),
  items: z.array(z.object({
    workItemId: z.coerce.number().int().positive().nullable().optional(),
    title: z.string().nullable().optional(),
    previousPlanSnapshot: z.string().nullable().optional(),
    doneThisWeek: z.string().nullable().optional(),
    planNextWeek: z.string().nullable().optional(),
    sortOrder: z.coerce.number().nullable().optional(),
  })).default([]),
});

export const GET = createCommandRoute({
  querySchema: reportQuerySchema,
  buildCommand: ({ query, user }) => buildWorkReportRouteCommand({
    userId: user.userId,
    query,
  }),
  action: executeGetWorkReportRouteCommand,
});

export const PUT = createCommandRoute({
  bodySchema: saveSchema,
  bodyError: "汇报内容格式不正确",
  buildCommand: ({ body, user }) => buildSaveWorkReportRouteCommand({
    userId: user.userId,
    body,
  }),
  action: executeSaveWorkReportRouteCommand,
});
