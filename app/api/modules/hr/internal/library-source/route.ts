import { loadHrLibrarySource } from "@workspace/hr/server/library-source";
import { createAuthoritativeLibrarySourceRoute } from "@workspace/platform/server/authoritative-library-source-route";

export const POST = createAuthoritativeLibrarySourceRoute({
  ownerUnitId: "hr",
  load: loadHrLibrarySource,
});
