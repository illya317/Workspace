import { executeGetComparisonPackageCommand } from "@workspace/finance/server/statements/comparison/route-commands";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

export const GET = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  buildCommand: ({ params }) => okCommand(params.id),
  action: (packageId) => executeGetComparisonPackageCommand(packageId),
});
