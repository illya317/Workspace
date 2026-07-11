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
  periodType: z.string().nullable().optional(),
  periodStart: z.string().nullable().optional(),
  reportStage: z.enum(["kr", "final"]).optional(),
});

const saveSchema = z.object({
  targetType: z.string(),
  targetId: z.coerce.number().int().positive(),
  periodType: z.string().nullable().optional(),
  periodStart: z.string().nullable().optional(),
  reportStage: z.enum(["kr", "final"]).optional(),
  items: z.array(z.object({
    workPlanId: z.coerce.number().int().positive().nullable().optional(),
    workItemId: z.coerce.number().int().positive().nullable().optional(),
    title: z.string().nullable().optional(),
    workPlanTitle: z.string().nullable().optional(),
    workPlanKind: z.string().nullable().optional(),
    workItemType: z.string().nullable().optional(),
    parentWorkItemId: z.coerce.number().int().positive().nullable().optional(),
    parentTitle: z.string().nullable().optional(),
    objectiveTitleSnapshot: z.string().nullable().optional(),
    keyResultTitleSnapshot: z.string().nullable().optional(),
    reportItemKind: z.enum(["assessment", "current", "routine", "next"]).nullable().optional(),
    workItemStatusSnapshot: z.string().nullable().optional(),
    snapshotPlannedStartDate: z.string().nullable().optional(),
    snapshotPlannedEndDate: z.string().nullable().optional(),
    snapshotActualEndDate: z.string().nullable().optional(),
    snapshotCompletedAt: z.string().nullable().optional(),
    previousPlanSnapshot: z.string().nullable().optional(),
    currentKeyResult: z.string().nullable().optional(),
    nextObjective: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
    selfScore: z.coerce.number().nullable().optional(),
    performanceScore: z.coerce.number().nullable().optional(),
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
