import { z } from "zod";

import { executeEmployeeAccountSearchCommand } from "@workspace/hr/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { isSuperAdmin } from "@workspace/platform/server/auth";
import { okCommand } from "@workspace/platform/server/domain-validation";

const employeeSearchQuerySchema = z.object({
  q: z.string().catch("").transform((value) => value.trim()),
});

export const GET = createCommandRoute({
  access: isSuperAdmin,
  querySchema: employeeSearchQuerySchema,
  buildCommand: ({ query }) => okCommand(query),
  action: executeEmployeeAccountSearchCommand,
});
