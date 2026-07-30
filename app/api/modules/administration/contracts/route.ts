import { z } from "zod";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { directCommandId } from "@workspace/platform/server/direct-command-meta";
import { ContractCreateSchema, executeCreateContractCommand, listContracts } from "@workspace/administration/server";

const optionalText = z.preprocess(
  (value) => {
    const text = typeof value === "string" ? value.trim() : "";
    return text || undefined;
  },
  z.string().optional(),
);

const contractsQuerySchema = z.object({
  q: optionalText,
  location: optionalText,
  category: optionalText,
  categoryId: z.coerce.number().int().positive().optional(),
  ownerDepartmentId: z.coerce.number().int().positive().optional(),
  lifecycleStatus: z.enum(["draft", "active", "terminated", "expired", "closed", "unknown"]).optional(),
  view: z.enum(["all", "needs_attention", "expiring", "expired"]).catch("all"),
  page: z.coerce.number().int().positive().catch(1),
  pageSize: z.coerce.number().int().positive().catch(50),
});

export const GET = createCommandRoute({
  querySchema: contractsQuerySchema,
  buildCommand: ({ query, user }) => okCommand({ ...query, userId: user.userId }),
  action: listContracts,
});

export const POST = createCommandRoute({
  bodySchema: ContractCreateSchema,
  buildCommand: ({ body, user, request }) => okCommand({
    body,
    userId: user.userId,
    idempotencyKey: directCommandId(request),
  }),
  action: executeCreateContractCommand,
});
