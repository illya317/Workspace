import { inventoryClosingAdapter } from "@workspace/inventory/server/closing-adapter";
import { inventoryClosingRpcRequestSchema } from "@workspace/platform/contracts/inventory-closing";
import { jsonErrorResponse } from "@workspace/platform/server/api";
import { createInternalApiRoute } from "@workspace/platform/server/api-route";
import { isWorkspaceInternalRequestAuthorized } from "@workspace/platform/server/internal-unit-rpc";

export const POST = createInternalApiRoute({
  authorize: async ({ request }) => isWorkspaceInternalRequestAuthorized(
    request,
    await request.clone().text(),
    { allowedCallerUnitIds: ["finance"], audienceUnitId: "inventory" },
  ),
  authorizeError: "存货关账检查认证失败",
  handler: async ({ request }) => {
    const parsed = inventoryClosingRpcRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonErrorResponse("存货关账检查请求无效", 400);
    return parsed.data.inspectionKind === "records"
      ? inventoryClosingAdapter.inspectPeriodRecords(parsed.data.scope)
      : inventoryClosingAdapter.inspectPeriodCountDifferences(parsed.data.scope);
  },
});
