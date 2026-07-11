import { authorize, isSuperAdmin } from "@workspace/platform/server/auth";

/**
 * Library confidentiality levels:
 *   1 — public
 *   2 — internal (default, visible with library access)
 *   3 — secret     (root-only after legacy capability removal)
 *   4 — top secret (root-only after legacy capability removal)
 */

/** Check basic library read permission (confidentiality <= 2). */
export async function checkLibraryRead(userId: number): Promise<boolean> {
  if (await isSuperAdmin(userId)) return true;
  return authorize({ user: userId, resourceKey: "library.basicInfo", action: "read" });
}

/** Check library update permission (edit summary/title/category). */
export async function checkLibraryUpdate(userId: number): Promise<boolean> {
  if (await isSuperAdmin(userId)) return true;
  return authorize({ user: userId, resourceKey: "library.basicInfo", action: "update" });
}

/** Check library archive permission. */
export async function checkLibraryArchive(userId: number): Promise<boolean> {
  if (await isSuperAdmin(userId)) return true;
  return authorize({ user: userId, resourceKey: "library.basicInfo", action: "archive" });
}

/** Check library export permission. */
export async function checkLibraryExport(userId: number): Promise<boolean> {
  if (await isSuperAdmin(userId)) return true;
  return authorize({ user: userId, resourceKey: "library.basicInfo", action: "export" });
}

/** Check library import permission (scan, generate, or upload a new file version). */
export async function checkLibraryImport(userId: number): Promise<boolean> {
  if (await isSuperAdmin(userId)) return true;
  return authorize({ user: userId, resourceKey: "library.basicInfo", action: "import" });
}

/** Check library configuration permission (edit confidentialityLevel). */
export async function checkLibraryConfigure(userId: number): Promise<boolean> {
  if (await isSuperAdmin(userId)) return true;
  return authorize({ user: userId, resourceKey: "library.basicInfo", action: "configure" });
}

/** Check secret access (confidentiality 3). */
export async function checkLibrarySecret(userId: number): Promise<boolean> {
  return isSuperAdmin(userId);
}

/** Check top secret access (confidentiality 4). */
export async function checkLibraryTopSecret(userId: number): Promise<boolean> {
  return isSuperAdmin(userId);
}

/** Return the highest confidentiality level visible to the user. */
export async function getMaxConfidentialityLevel(userId: number): Promise<number> {
  if (await checkLibraryTopSecret(userId)) return 4;
  if (await checkLibrarySecret(userId)) return 3;
  if (await checkLibraryRead(userId)) return 2;
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
