import {
  ContractApprovalReferenceSchema,
  executeSetContractApprovalReference,
} from "@workspace/administration/server";
import { readRequestExpectedVersion, routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

export const PUT = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "无效ID",
  bodySchema: ContractApprovalReferenceSchema,
  buildCommand: ({ params, body, request, user }) => okCommand({
    contractId: params.id,
    body,
    userId: user.userId,
    expectedVersion: readRequestExpectedVersion(request),
  }),
  action: executeSetContractApprovalReference,
});
