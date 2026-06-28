import { z } from "zod";

import { buildHrRouteCommand, createEmployeeContract, getContracts } from "@workspace/hr/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { checkHRAccess, checkHRWrite } from "@workspace/platform/server/auth";

const contractsQuerySchema = z.object({
  company: z.string().optional(),
  department: z.string().catch(""),
  isActive: z.string().nullable().optional(),
  keyword: z.string().optional(),
  position: z.string().catch(""),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(500).catch(50),
}).passthrough();

const createContractSchema = z.object({
  employeeId: z.unknown().optional(),
}).passthrough();

export const GET = createCommandRoute({
  access: (userId: number) => checkHRAccess(userId, "access", "hr.roster"),
  querySchema: contractsQuerySchema,
  queryError: "参数错误",
  buildCommand: ({ query }) => buildHrRouteCommand(query),
  action: getContracts,
});

export const POST = createCommandRoute({
  access: (userId: number) => checkHRWrite(userId, "hr.roster"),
  bodySchema: createContractSchema,
  bodyError: "请求体必须为 JSON",
  buildCommand: ({ body, user }) => {
    const { employeeId, ...contractData } = body;
    return buildHrRouteCommand({ employeeId, contractData, editorId: user.userId });
  },
  action: createEmployeeContract,
});
