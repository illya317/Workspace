import { cleanupExpiredLibraryExports } from "@workspace/library/server/export";
import { isWecomAgentBridgeRequestAuthorized } from "@workspace/platform/server/wecom-agent-bridge-auth";
import { createInternalApiRoute } from "@workspace/platform/server/api-route";

export const runtime = "nodejs";

export const POST = createInternalApiRoute({
  authorize: ({ request }) => isWecomAgentBridgeRequestAuthorized(request, ""),
  authorizeError: "Invalid WeCom bridge authentication",
  handler: () => cleanupExpiredLibraryExports(),
});
