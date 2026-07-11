import { z } from "zod";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { canUseProject, createProjectMemberAction, listProjectMembers } from "@workspace/work/server";

const memberDateSchema = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).nullable().optional();
const employeeNumberSchema = z.union([z.string(), z.number()]).transform((value) => String(value).trim()).pipe(z.string().min(1));
const optionalPositiveIntSchema = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.coerce.number().int().positive().optional(),
);

const createProjectMemberSchema = z.object({
  employeeNumber: employeeNumberSchema.optional(),
  employeeId: employeeNumberSchema.optional(),
  projectId: z.coerce.number().int().positive(),
  role: z.string().nullable().optional(),
  startDate: memberDateSchema,
  endDate: memberDateSchema,
}).refine((body) => Boolean(body.employeeNumber || body.employeeId), {
  message: "员工不能为空",
  path: ["employeeNumber"],
});

const listProjectMembersQuerySchema = z.object({
  projectId: optionalPositiveIntSchema,
  keyword: z.string().optional(),
  page: optionalPositiveIntSchema,
  pageSize: optionalPositiveIntSchema,
}).passthrough();

export const GET = createCommandRoute({
  querySchema: listProjectMembersQuerySchema,
  access: (userId: number) => canUseProject(userId),
  buildCommand: ({ user, query }) => okCommand<Parameters<typeof listProjectMembers>[0]>({
      userId: user.userId,
      projectId: query.projectId ?? null,
      keyword: query.keyword || "",
      page: Math.max(1, query.page ?? 1),
      pageSize: Math.min(500, Math.max(1, query.pageSize ?? 50)),
  }),
  action: listProjectMembers,
});

export const POST = createCommandRoute({
  bodySchema: createProjectMemberSchema,
  buildCommand: ({ user, body }) => okCommand({
    userId: user.userId,
    body: body as Record<string, unknown>,
  }),
  action: createProjectMemberAction,
});
