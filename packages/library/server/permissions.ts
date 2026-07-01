import { authorize, evaluatePermissionAction, isSuperAdmin } from "@workspace/platform/server/auth";

/**
 * Library confidentiality levels:
 *   1 — public
 *   2 — internal (default, visible with library access)
 *   3 — secret     (root-only after legacy capability removal)
 *   4 — top secret (root-only after legacy capability removal)
 */

/** Check basic library access (confidentiality ≤ 2). */
export async function checkLibraryAccess(userId: number): Promise<boolean> {
  if (await isSuperAdmin(userId)) return true;
  return authorize({ user: userId, resourceKey: "library.basicInfo", action: "access" });
}

/** Check library write permission (edit summary/title/category). */
export async function checkLibraryWrite(userId: number): Promise<boolean> {
  if (await isSuperAdmin(userId)) return true;
  return authorize({ user: userId, resourceKey: "library.basicInfo", action: "write" });
}

/** Check library archive permission. */
export async function checkLibraryArchive(userId: number): Promise<boolean> {
  if (await isSuperAdmin(userId)) return true;
  return evaluatePermissionAction(userId, "library.basicInfo", "archive");
}

/** Check library export permission. */
export async function checkLibraryExport(userId: number): Promise<boolean> {
  if (await isSuperAdmin(userId)) return true;
  return evaluatePermissionAction(userId, "library.basicInfo", "export");
}

/** Check library admin permission (edit confidentialityLevel). */
export async function checkLibraryAdmin(userId: number): Promise<boolean> {
  if (await isSuperAdmin(userId)) return true;
  return authorize({ user: userId, resourceKey: "library.basicInfo", action: "admin" });
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
  if (await checkLibraryAccess(userId)) return 2;
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
