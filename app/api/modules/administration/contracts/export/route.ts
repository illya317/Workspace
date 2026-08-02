import { z } from "zod";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { exportContracts } from "@workspace/administration/server";

const optionalText = z.preprocess(
  (value) => {
    const text = typeof value === "string" ? value.trim() : "";
    return text || undefined;
  },
  z.string().optional(),
);

const contractsExportQuerySchema = z.object({
  q: optionalText,
  location: optionalText,
  category: optionalText,
  categoryId: z.coerce.number().int().positive().optional(),
  ownerDepartmentId: z.coerce.number().int().positive().optional(),
  lifecycleStatus: z.enum(["draft", "active", "terminated", "expired", "closed", "unknown"]).optional(),
  view: z.enum(["all", "needs_attention", "expiring", "expired"]).catch("all"),
});

export const GET = createCommandRoute({
  querySchema: contractsExportQuerySchema,
  buildCommand: ({ query, user }) => okCommand({ ...query, userId: user.userId }),
  action: exportContracts,
});
