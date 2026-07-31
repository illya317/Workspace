import { z } from "zod";

import {
  archiveInvestorDueDiligenceRecord,
  updateInvestorDueDiligenceRecord,
} from "@workspace/capital-securities/server";
import { readRequestExpectedVersion, routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { failCommand, okCommand } from "@workspace/platform/server/domain-validation";

const bodySchema = z.object({
  issuerCompanyId: z.coerce.number().int().positive(),
  investorOrganization: z.string().trim().min(1).max(200),
  visitorName: z.string().trim().min(1).max(100),
  diligenceDate: z.iso.date(),
}).passthrough();

export const PATCH = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  bodySchema,
  paramsError: "无效ID",
  buildCommand: ({ params, body, user, request }) => {
    const expectedVersion = readRequestExpectedVersion(request);
    return expectedVersion === undefined
      ? failCommand("缺少记录版本，请刷新后重试", 428)
      : okCommand({
          userId: user.userId,
          id: params.id,
          issuerCompanyId: body.issuerCompanyId,
          expectedVersion,
          body,
        });
  },
  action: updateInvestorDueDiligenceRecord,
});

export const DELETE = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "无效ID",
  buildCommand: ({ params, user, request }) => {
    const expectedVersion = readRequestExpectedVersion(request);
    return expectedVersion === undefined
      ? failCommand("缺少记录版本，请刷新后重试", 428)
      : okCommand({ userId: user.userId, id: params.id, expectedVersion });
  },
  action: archiveInvestorDueDiligenceRecord,
});
