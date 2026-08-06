import {
  amountOriginQueryBodySchema,
  buildAmountOriginQueryRouteCommand,
  executeAmountOriginQueryRouteCommand,
} from "@workspace/finance/server/statements/comparison/route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";

// 显式 read-only POST exception（permission-api-action-policy 注册 requiredActions: ["read"]）：
// 复杂只读金额来源查询，无任何持久化；结果恒含 residual/ambiguity/truncation
// 与 accountingTreatment: "not_evaluated"。
export const POST = createCommandRoute({
  bodySchema: amountOriginQueryBodySchema,
  bodyError: "金额来源查询参数无效",
  buildCommand: ({ body }) => buildAmountOriginQueryRouteCommand({ body }),
  action: (command) => executeAmountOriginQueryRouteCommand(command),
});
