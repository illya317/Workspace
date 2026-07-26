import { loadFinanceLibrarySource } from "@workspace/finance/server/statements/library-source";
import { createAuthoritativeLibrarySourceRoute } from "@workspace/platform/server/authoritative-library-source-route";

export const POST = createAuthoritativeLibrarySourceRoute({
  ownerUnitId: "finance",
  load: loadFinanceLibrarySource,
});
