import { handleBusinessDocumentIntelligence } from "@workspace/library/server/business-document-intelligence";
import { createInternalApiRoute } from "@workspace/platform/server/api-route";
import { jsonErrorResponse } from "@workspace/platform/server/api";
import { businessDocumentIntelligenceRequestSchema } from "@workspace/platform/server/business-document-intelligence-contract";
import { isWorkspaceInternalRequestAuthorized } from "@workspace/platform/server/internal-unit-rpc";

export const POST = createInternalApiRoute({
  authorize: async ({ request }) => isWorkspaceInternalRequestAuthorized(
    request,
    await request.clone().text(),
    { allowedCallerUnitIds: ["capital-securities"], audienceUnitId: "library" },
  ),
  authorizeError: "Business document intelligence authentication failed",
  handler: async ({ request }) => {
    const parsed = businessDocumentIntelligenceRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonErrorResponse("Invalid business document intelligence request", 400);
    try {
      return await handleBusinessDocumentIntelligence(parsed.data);
    } catch (error) {
      return jsonErrorResponse(error instanceof Error ? error.message : "Business document intelligence failed", 409);
    }
  },
});
