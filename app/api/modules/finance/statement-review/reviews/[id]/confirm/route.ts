import {
  buildFinanceReviewConfirmCommand,
  executeFinanceReviewConfirmCommand,
} from "@workspace/finance/server/route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { checkFinanceStatementReviewWrite } from "@workspace/platform/server/auth";
import { reviewIdSchema } from "@workspace/finance/server/statements/reviews/schemas";

export const POST = createCommandRoute({
  access: checkFinanceStatementReviewWrite,
  paramsSchema: reviewIdSchema,
  paramsError: "id 必须为数字",
  buildCommand: ({ params, user }) => buildFinanceReviewConfirmCommand(params.id, user.userId),
  action: executeFinanceReviewConfirmCommand,
});
