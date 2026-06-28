import { z } from "zod";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { checkContractAccess } from "@workspace/platform/server/auth";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { ContractCreateSchema, createContract, listContracts } from "@workspace/administration/server";

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
  access: checkContractAccess,
  querySchema: contractsQuerySchema,
  buildCommand: ({ query }) => okCommand(query),
  action: listContracts,
});

export const POST = createCommandRoute({
  access: checkContractAccess,
  bodySchema: ContractCreateSchema,
  buildCommand: ({ body }) => okCommand(body),
  action: async (command) => ({ success: true, record: await createContract(command) }),
});
