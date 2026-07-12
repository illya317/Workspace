import { evaluateResourceAuthorization } from "@workspace/platform/server/resource-authorization";

async function authorizeLibrary(userId: number, action: "read" | "update" | "archive" | "export" | "import" | "configure") {
  return evaluateResourceAuthorization({ userId, resourceKey: "library.basicInfo", action });
}

/**
 * Library confidentiality levels:
 *   1 — public
 *   2 — internal (default, visible with library access)
 *   3 — secret     (root-only after legacy capability removal)
 *   4 — top secret (root-only after legacy capability removal)
 */

/** Check basic library read permission (confidentiality <= 2). */
export async function checkLibraryRead(userId: number): Promise<boolean> {
  return (await authorizeLibrary(userId, "read")).allowed;
}

/** Check library update permission (edit summary/title/category). */
export async function checkLibraryUpdate(userId: number): Promise<boolean> {
  return (await authorizeLibrary(userId, "update")).allowed;
}

/** Check library archive permission. */
export async function checkLibraryArchive(userId: number): Promise<boolean> {
  return (await authorizeLibrary(userId, "archive")).allowed;
}

/** Check library export permission. */
export async function checkLibraryExport(userId: number): Promise<boolean> {
  return (await authorizeLibrary(userId, "export")).allowed;
}

/** Check library import permission (scan, generate, or upload a new file version). */
export async function checkLibraryImport(userId: number): Promise<boolean> {
  return (await authorizeLibrary(userId, "import")).allowed;
}

/** Check library configuration permission (edit confidentialityLevel). */
export async function checkLibraryConfigure(userId: number): Promise<boolean> {
  return (await authorizeLibrary(userId, "configure")).allowed;
}

/** Check secret access (confidentiality 3). */
export async function checkLibrarySecret(userId: number): Promise<boolean> {
  return (await authorizeLibrary(userId, "read")).isRootAdmin;
}

/** Check top secret access (confidentiality 4). */
export async function checkLibraryTopSecret(userId: number): Promise<boolean> {
  return (await authorizeLibrary(userId, "read")).isRootAdmin;
}

/** Return the highest confidentiality level visible to the user. */
export async function getMaxConfidentialityLevel(userId: number): Promise<number> {
  const access = await authorizeLibrary(userId, "read");
  if (access.isRootAdmin) return 4;
  if (access.allowed) return 2;
  return 0;
}

/**
 * Build a Prisma where-clause fragment to filter by confidentiality.
 * Returns an object suitable for spreading into a Prisma `where`.
 */
export async function buildConfidentialityFilter(
  userId: number,
): Promise<{ confidentialityLevel?: { lte: number } }> {
  const max = await getMaxConfidentialityLevel(userId);
  if (max <= 0) return {};
  return { confidentialityLevel: { lte: max } };
}
