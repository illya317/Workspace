import { z } from "zod";

import { createInvestorDueDiligenceRecord } from "@workspace/capital-securities/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { directCommandId } from "@workspace/platform/server/direct-command-meta";

const bodySchema = z.object({
  issuerCompanyId: z.coerce.number().int().positive(),
  investorOrganization: z.string().trim().min(1).max(200),
  visitorName: z.string().trim().min(1).max(100),
  diligenceDate: z.iso.date(),
}).passthrough();

export const POST = createCommandRoute({
  bodySchema,
  buildCommand: ({ body, user, request }) => okCommand({
    userId: user.userId,
    issuerCompanyId: body.issuerCompanyId,
    idempotencyKey: directCommandId(request),
    body,
  }),
  action: createInvestorDueDiligenceRecord,
});
