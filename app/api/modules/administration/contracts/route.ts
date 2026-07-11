import { z } from "zod";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { createCommandRoute } from "@workspace/platform/server/api-route";
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
  status: optionalText,
  page: z.coerce.number().int().positive().catch(1),
  pageSize: z.coerce.number().int().positive().catch(50),
});

export const GET = createCommandRoute({
  querySchema: contractsQuerySchema,
  buildCommand: ({ query }) => okCommand(query),
  action: listContracts,
});

export const POST = createCommandRoute({
  bodySchema: ContractCreateSchema,
  buildCommand: ({ body, user }) => okCommand({ body, userId: user.userId }),
  action: executeCreateContractCommand,
});
