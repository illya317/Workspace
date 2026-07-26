import { z } from "zod";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import {
  buildListDepartmentCollaborationsCommand,
  buildSubmitDepartmentCollaborationCommand,
  executeListDepartmentCollaborationsCommand,
  executeSubmitDepartmentCollaborationCommand,
} from "@workspace/work/server";
import { departmentCollaborationWriteSchema } from "./write-schema";

const querySchema = z.object({
  departmentId: z.coerce.number(),
});

export const GET = createCommandRoute({
  querySchema,
  queryError: "协作查询参数无效",
  buildCommand: ({ query, user }) => buildListDepartmentCollaborationsCommand({
    userId: user.userId,
    departmentId: query.departmentId,
  }),
  action: executeListDepartmentCollaborationsCommand,
});

export const POST = createCommandRoute({
  bodySchema: departmentCollaborationWriteSchema,
  bodyError: "协作提交参数无效",
  buildCommand: ({ body, user }) => buildSubmitDepartmentCollaborationCommand({
    userId: user.userId,
    body,
  }),
  action: executeSubmitDepartmentCollaborationCommand,
});
