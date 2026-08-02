import { z } from "zod";

import { buildHrRouteCommand, deleteDepartment, executeCreateDepartmentWithWorkflowGuard, executeUpdateDepartmentWithWorkflowGuard, listDepartments, organizationStructureLifecycleMetaFromRequest } from "@workspace/hr/server";
import { readRequestExpectedVersion, routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";const departmentsQuerySchema = z.object({
  keyword: z.string().catch(""),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(500).catch(50),
  archived: z.enum(["1", "true"]).optional().catch(undefined),
  summary: z.enum(["1", "true"]).optional().catch(undefined),
}).passthrough();

const departmentBodySchema = z.object({}).passthrough();

export const GET = createCommandRoute({
  querySchema: departmentsQuerySchema,
  buildCommand: ({ query, user }) => buildHrRouteCommand({
    keyword: query.keyword,
    page: query.page,
    pageSize: query.pageSize,
    archived: Boolean(query.archived),
    summary: Boolean(query.summary),
    userId: user.userId,
  }),
  action: listDepartments,
});

export const POST = createCommandRoute({
  bodySchema: departmentBodySchema,
  buildCommand: ({ request, body, user }) => buildHrRouteCommand({
    body: { ...body, lifecycle: organizationStructureLifecycleMetaFromRequest(request, { ...lifecycleInput(body), expectedSequence: 0 }) },
    userId: user.userId,
  }),
  action: executeCreateDepartmentWithWorkflowGuard,
});

export const PUT = createCommandRoute({
  bodySchema: departmentBodySchema,
  buildCommand: ({ request, body, user }) => buildHrRouteCommand({
    body: {
      ...body,
      lifecycle: organizationStructureLifecycleMetaFromRequest(request, {
        ...lifecycleInput(body),
        expectedSequence: readRequestExpectedVersion(request) ?? body.version,
      }),
    },
    userId: user.userId,
  }),
  action: executeUpdateDepartmentWithWorkflowGuard,
});

export const DELETE = createCommandRoute({
  querySchema: routeIdParamsSchema,
  queryError: "缺少id",
  buildCommand: ({ request, query, user }) => buildHrRouteCommand({
    userId: user.userId,
    id: query.id,
    expectedVersion: readRequestExpectedVersion(request),
  }),
  action: deleteDepartment,
});

function lifecycleInput(body: Record<string, unknown>) {
  return body.lifecycle && typeof body.lifecycle === "object"
    ? body.lifecycle as Record<string, unknown>
    : {};
}
