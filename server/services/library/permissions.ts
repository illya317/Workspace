import { checkPermission } from "@/server/rbac/check";

/**
 * Library confidentiality levels:
 *   1 — public
 *   2 — internal (default, visible with library access)
 *   3 — secret     (requires library.secret)
 *   4 — top secret (requires library.top_secret)
 */

/** Check basic library access (confidentiality ≤ 2). */
export async function checkLibraryAccess(userId: number): Promise<boolean> {
  if (await checkPermission(userId, "system", "admin")) return true;
  return checkPermission(userId, "library", "access");
}

/** Check library write permission (edit summary/title/category). */
export async function checkLibraryWrite(userId: number): Promise<boolean> {
  if (await checkPermission(userId, "system", "admin")) return true;
  return checkPermission(userId, "library.write", "write");
}

/** Check library delete permission (soft delete / archive). */
export async function checkLibraryDelete(userId: number): Promise<boolean> {
  if (await checkPermission(userId, "system", "admin")) return true;
  return checkPermission(userId, "library.write", "delete");
}

/** Check library admin permission (edit confidentialityLevel). */
export async function checkLibraryAdmin(userId: number): Promise<boolean> {
  if (await checkPermission(userId, "system", "admin")) return true;
  return checkPermission(userId, "library.write", "admin");
}

/** Check library.secret access (confidentiality 3). */
export async function checkLibrarySecret(userId: number): Promise<boolean> {
  if (await checkPermission(userId, "system", "admin")) return true;
  return checkPermission(userId, "library.secret", "access");
}

/** Check library.top_secret access (confidentiality 4). */
export async function checkLibraryTopSecret(userId: number): Promise<boolean> {
  if (await checkPermission(userId, "system", "admin")) return true;
  return checkPermission(userId, "library.top_secret", "access");
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
