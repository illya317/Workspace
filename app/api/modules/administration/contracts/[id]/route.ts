import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { checkContractAccess } from "@workspace/platform/server/auth";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { ContractUpdateSchema, buildContractUpdateRouteCommand, deleteContract, updateContract } from "@workspace/administration/server";

export const PATCH = createCommandRoute({
  access: checkContractAccess,
  paramsSchema: routeIdParamsSchema,
  bodySchema: ContractUpdateSchema,
  paramsError: "无效ID",
  buildCommand: ({ params, body }) => buildContractUpdateRouteCommand({ id: params.id, body }),
  action: async (command) => {
    await updateContract(command.id, command.body);
    return { success: true };
  },
});

export const DELETE = createCommandRoute({
  access: checkContractAccess,
  paramsSchema: routeIdParamsSchema,
  paramsError: "无效ID",
  buildCommand: ({ params }) => okCommand({ id: params.id }),
  action: async (command) => {
    await deleteContract(command.id);
    return { success: true };
  },
});
