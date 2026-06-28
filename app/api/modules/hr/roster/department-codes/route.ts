import { z } from "zod";

import { buildHrRouteCommand, deleteDepartmentCode, getDepartmentCodes, upsertDepartmentCode } from "@workspace/hr/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { checkHRAccess, checkHRDelete, checkHRWrite } from "@workspace/platform/server/auth";

const querySchema = z.object({
  companys: z.string().optional(),
  company: z.string().optional(),
});

const upsertDepartmentCodeSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  company: z.string().optional(),
  companyCode: z.string().optional(),
  originalCode: z.string().optional(),
});

const deleteDepartmentCodeSchema = z.object({
  code: z.string().min(1),
});

export const GET = createCommandRoute({
  access: (userId: number) => checkHRAccess(userId, "access", "hr.roster"),
  querySchema,
  queryError: "参数无效",
  buildCommand: ({ query }) => buildHrRouteCommand(query),
  action: getDepartmentCodes,
});

export const PUT = createCommandRoute({
  access: (userId: number) => checkHRWrite(userId, "hr.roster"),
  bodySchema: upsertDepartmentCodeSchema,
  bodyError: "缺少参数",
  buildCommand: ({ body, user }) => buildHrRouteCommand({ body, userId: user.userId }),
  action: ({ body, userId }) => upsertDepartmentCode(body, userId),
});

export const DELETE = createCommandRoute({
  access: (userId: number) => checkHRDelete(userId, "hr.roster"),
  querySchema: deleteDepartmentCodeSchema,
  queryError: "缺少code",
  buildCommand: ({ query, user }) => buildHrRouteCommand({ code: query.code, userId: user.userId }),
  action: ({ code, userId }) => deleteDepartmentCode(code, userId),
});
