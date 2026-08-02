import { createCompatibilityProxyHandler } from "@workspace/platform/server/api";

/** @deprecated Use the Library-owned module endpoint. */
export const GET = createCompatibilityProxyHandler(
  "/api/modules/library/integrations/onlyoffice/documents",
  { sourcePathPrefix: "/api/integrations/onlyoffice/library-documents" },
);
