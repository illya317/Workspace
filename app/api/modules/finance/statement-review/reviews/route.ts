import {
  buildGenerateReviewCommand,
  executeGenerateReviewCommand,
  executeGetReviewCommand,
} from "@workspace/finance/server/route-commands";
import {
  generateReviewSchema,
  reviewQuerySchema,
} from "@workspace/finance/server/statements/reviews/schemas";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";export const GET = createCommandRoute({
  querySchema: reviewQuerySchema,
  queryError: "workpaperId 或 (companyCode, year, month, reportType) 为必填",
  buildCommand: ({ query }) => okCommand(query),
  action: executeGetReviewCommand,
});

export const POST = createCommandRoute({
  bodySchema: generateReviewSchema,
  bodyError: "workpaperId 为必填",
  buildCommand: ({ body, user }) => buildGenerateReviewCommand(body.workpaperId, user.userId),
  action: executeGenerateReviewCommand,
});
