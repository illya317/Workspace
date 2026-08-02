import { createCompatibilityProxyHandler } from "@workspace/platform/server/api";

export const runtime = "nodejs";

/** @deprecated Use the Library-owned module endpoint. */
export const POST = createCompatibilityProxyHandler(
  "/api/modules/library/integrations/wecom/agent/artifacts/cleanup",
  { sourcePathPrefix: "/api/integrations/wecom/agent/artifacts/cleanup" },
);
