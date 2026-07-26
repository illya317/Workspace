import { readRequestExpectedVersion, routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";
import {
  InventoryReceiptUpdateSchema,
  executeDeleteReceiptCommand,
  executeUpdateReceiptCommand,
} from "@workspace/inventory/server/receipts/index";

export const PATCH = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  bodySchema: InventoryReceiptUpdateSchema,
  paramsError: "无效记录ID",
  buildCommand: ({ params, body, user }) => okCommand({ id: params.id, body, userId: user.userId }),
  action: executeUpdateReceiptCommand,
});

export const DELETE = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "无效记录ID",
  buildCommand: ({ params, request, user }) => okCommand({ id: params.id, userId: user.userId, expectedVersion: readRequestExpectedVersion(request) }),
  action: executeDeleteReceiptCommand,
});
