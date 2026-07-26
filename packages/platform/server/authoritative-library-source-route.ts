import "server-only";

import { jsonErrorResponse } from "./api";
import { createInternalApiRoute } from "./api-route";
import {
  authoritativeLibraryArtifactsSchema,
  authoritativeLibrarySourceRequestSchema,
  type AuthoritativeLibraryArtifactLoader,
} from "./authoritative-library-source-contract";
import { isWorkspaceInternalRequestAuthorized } from "./internal-unit-rpc";

const LIBRARY_UNIT_ID = "library";

export function createAuthoritativeLibrarySourceRoute(input: {
  ownerUnitId: string;
  load: AuthoritativeLibraryArtifactLoader;
}) {
  return createInternalApiRoute({
    authorize: async ({ request }) => isWorkspaceInternalRequestAuthorized(
      request,
      await request.clone().text(),
      { allowedCallerUnitIds: [LIBRARY_UNIT_ID], audienceUnitId: input.ownerUnitId },
    ),
    authorizeError: "Library source authentication failed",
    handler: async ({ request }) => {
      const parsed = authoritativeLibrarySourceRequestSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return jsonErrorResponse("Invalid Library source request", 400);
      try {
        const loaded = await input.load(parsed.data.sourceKey);
        const artifacts = authoritativeLibraryArtifactsSchema.parse(Array.isArray(loaded) ? loaded : [loaded]);
        if (artifacts.some((artifact) => (
          artifact.ownerUnitId !== input.ownerUnitId || artifact.sourceKey !== parsed.data.sourceKey
        ))) {
          return jsonErrorResponse("Library source artifact identity mismatch", 500);
        }
        return artifacts;
      } catch (error) {
        return jsonErrorResponse(
          error instanceof Error ? error.message : "Library source generation failed",
          409,
        );
      }
    },
  });
}
