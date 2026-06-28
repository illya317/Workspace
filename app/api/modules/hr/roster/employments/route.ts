import { z } from "zod";

import { buildHrRouteCommand, createEmploymentRecord, listEmployments } from "@workspace/hr/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { checkHRAccess } from "@workspace/platform/server/auth";

const employmentsQuerySchema = z.object({
  keyword: z.string().catch(""),
  isActive: z.string().nullable().optional(),
  company: z.string().catch(""),
  department: z.string().catch(""),
  position: z.string().catch(""),
  personnelType: z.string().catch(""),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(500).catch(50),
}).passthrough();

const dateStringSchema = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).nullable().optional();
const optionalTextSchema = z.string().nullable().optional();
const optionalBooleanSchema = z.union([z.boolean(), z.enum(["true", "false"]).transform((value) => value === "true")]).optional();

const createEmploymentSchema = z.object({
  employeeId: z.coerce.number().int().positive(),
  isActive: optionalBooleanSchema,
  joinDate: dateStringSchema,
  leaveDate: dateStringSchema,
  leaveReason: optionalTextSchema,
  leaveNote: optionalTextSchema,
  officeLocation: optionalTextSchema,
  personnelType: optionalTextSchema,
  rank: optionalTextSchema,
  title: optionalTextSchema,
  contracts: optionalTextSchema,
});

export const GET = createCommandRoute({
  access: (userId: number) => checkHRAccess(userId, "access", "hr.roster"),
  querySchema: employmentsQuerySchema,
  queryError: "参数错误",
  buildCommand: ({ query }) => buildHrRouteCommand({ ...query, isActive: query.isActive ?? null }),
  action: listEmployments,
});

export const POST = createCommandRoute({
  bodySchema: createEmploymentSchema,
  bodyError: "参数错误",
  buildCommand: ({ body, user }) => buildHrRouteCommand({ body, userId: user.userId }),
  action: ({ body, userId }) => createEmploymentRecord(body, userId),
});
