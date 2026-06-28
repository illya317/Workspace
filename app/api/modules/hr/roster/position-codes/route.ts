import { z } from "zod";

import { buildHrRouteCommand, deletePositionCode, getPositionCodes, upsertPositionCode } from "@workspace/hr/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { checkHRAccess, checkHRDelete, checkHRWrite } from "@workspace/platform/server/auth";

const positionCodesQuerySchema = z.object({
  companys: z.string().optional(),
  company: z.string().optional(),
  departmentCode: z.string().optional(),
  positionCode: z.string().optional(),
});

const upsertPositionCodeSchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  company: z.string().optional(),
  companyCode: z.string().optional(),
  originalCode: z.string().optional(),
  departmentCode: z.string().optional(),
});

const deletePositionCodeQuerySchema = z.object({
  code: z.string().trim().min(1),
});

export const GET = createCommandRoute({
  access: (userId: number) => checkHRAccess(userId, "access", "hr.roster"),
  querySchema: positionCodesQuerySchema,
  buildCommand: ({ query }) => buildHrRouteCommand(query),
  action: getPositionCodes,
});

export const PUT = createCommandRoute({
  access: (userId: number) => checkHRWrite(userId, "hr.roster"),
  bodySchema: upsertPositionCodeSchema,
  bodyError: "缺少参数",
  buildCommand: ({ body, user }) => buildHrRouteCommand({ body, userId: user.userId }),
  action: ({ body, userId }) => upsertPositionCode(body, userId),
});

export const DELETE = createCommandRoute({
  access: (userId: number) => checkHRDelete(userId, "hr.roster"),
  querySchema: deletePositionCodeQuerySchema,
  queryError: "缺少code",
  buildCommand: ({ query, user }) => buildHrRouteCommand({ code: query.code, userId: user.userId }),
  action: ({ code, userId }) => deletePositionCode(code, userId),
});
