import { loadCapitalSecuritiesLibrarySource } from "@workspace/capital-securities/server/library-source";
import { createAuthoritativeLibrarySourceRoute } from "@workspace/platform/server/authoritative-library-source-route";

export const POST = createAuthoritativeLibrarySourceRoute({
  ownerUnitId: "capital-securities",
  load: loadCapitalSecuritiesLibrarySource,
});
