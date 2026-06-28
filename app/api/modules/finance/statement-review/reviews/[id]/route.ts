import {
  buildUpdateReviewCommand,
  executeUpdateReviewCommand,
} from "@workspace/finance/server/route-commands";
import {
  reviewIdSchema,
  updateReviewSchema,
} from "@workspace/finance/server/statements/reviews/schemas";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { checkFinanceStatementReviewWrite } from "@workspace/platform/server/auth";

export const PUT = createCommandRoute({
  access: checkFinanceStatementReviewWrite,
  paramsSchema: reviewIdSchema,
  paramsError: "id 必须为数字",
  bodySchema: updateReviewSchema,
  bodyError: "lines 数组为必填",
  buildCommand: ({ params, body, user }) => buildUpdateReviewCommand({
    id: params.id,
    lines: body.lines,
    note: body.note,
    userId: user.userId,
  }),
  action: executeUpdateReviewCommand,
});
