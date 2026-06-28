import { z } from "zod";

import { executeEmployeeProfileCommand } from "@workspace/hr/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { checkHRAccess } from "@workspace/platform/server/auth";
import { okCommand } from "@workspace/platform/server/domain-validation";

const employeeProfileParamsSchema = z.object({
  id: z.string().min(1),
});

export const GET = createCommandRoute({
  access: (userId: number) => checkHRAccess(userId, "access", "hr.roster"),
  paramsSchema: employeeProfileParamsSchema,
  buildCommand: ({ params }) => okCommand(params),
  action: executeEmployeeProfileCommand,
});
