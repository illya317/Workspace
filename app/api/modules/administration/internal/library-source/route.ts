import { loadAdministrationLibrarySource } from "@workspace/administration/server";
import { createAuthoritativeLibrarySourceRoute } from "@workspace/platform/server/authoritative-library-source-route";

export const POST = createAuthoritativeLibrarySourceRoute({
  ownerUnitId: "administration",
  load: loadAdministrationLibrarySource,
});
