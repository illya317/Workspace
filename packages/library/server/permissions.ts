import { evaluateResourceAuthorization } from "@workspace/platform/server/resource-authorization";
import type { Prisma } from "@workspace/platform/server/prisma";

const AUTHORITATIVE_SOURCE_READ_REQUIREMENTS = {
  "finance-report": "finance.statements",
  "ownership-structure": "capitalSecurities.investors",
  "organization-chart": "hr.roster",
  "roster-due-diligence": "hr.roster.generated",
  "contract-ledger": "administration.contracts",
} as const;

type LibraryDocumentAccessFacts = {
  confidentialityLevel: number;
  generatorKey: string | null;
};

export type LibraryDocumentAccessPolicy = {
  maxConfidentialityLevel: number;
  deniedGeneratorKeys: readonly string[];
  where: Prisma.LibraryDocumentWhereInput;
  allows: (document: LibraryDocumentAccessFacts) => boolean;
};

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

export function getLibrarySourceReadRequirement(generatorKey: string | null | undefined) {
  if (!generatorKey) return null;
  return AUTHORITATIVE_SOURCE_READ_REQUIREMENTS[
    generatorKey as keyof typeof AUTHORITATIVE_SOURCE_READ_REQUIREMENTS
  ] ?? null;
}

export function buildLibraryDocumentAccessPolicy(
  maxConfidentialityLevel: number,
  readableSourceResourceKeys: ReadonlySet<string>,
): LibraryDocumentAccessPolicy {
  const deniedGeneratorKeys = Object.entries(AUTHORITATIVE_SOURCE_READ_REQUIREMENTS)
    .filter(([, resourceKey]) => !readableSourceResourceKeys.has(resourceKey))
    .map(([generatorKey]) => generatorKey);
  const where: Prisma.LibraryDocumentWhereInput = maxConfidentialityLevel <= 0
    ? { id: -1 }
    : {
        AND: [
          { confidentialityLevel: { lte: maxConfidentialityLevel } },
          ...(deniedGeneratorKeys.length > 0
            ? [{
                OR: [
                  { generatorKey: null },
                  { generatorKey: { notIn: deniedGeneratorKeys } },
                ],
              }]
            : []),
        ],
      };

  return {
    maxConfidentialityLevel,
    deniedGeneratorKeys,
    where,
    allows(document) {
      if (maxConfidentialityLevel <= 0 || document.confidentialityLevel > maxConfidentialityLevel) return false;
      const requirement = getLibrarySourceReadRequirement(document.generatorKey);
      return !requirement || readableSourceResourceKeys.has(requirement);
    },
  };
}

/**
 * Build the complete read policy for Library documents.
 *
 * Authoritative Workspace snapshots require both Library read access and read
 * access to their owning business resource. Uploaded and other generated
 * documents continue to use Library access plus confidentiality only.
 */
export async function getLibraryDocumentAccessPolicy(userId: number): Promise<LibraryDocumentAccessPolicy> {
  const libraryAccess = await authorizeLibrary(userId, "read");
  const maxConfidentialityLevel = libraryAccess.isRootAdmin ? 4 : libraryAccess.allowed ? 2 : 0;
  const sourceResourceKeys = [...new Set(Object.values(AUTHORITATIVE_SOURCE_READ_REQUIREMENTS))];
  const readableSourceResourceKeys = new Set<string>();

  if (libraryAccess.isRootAdmin) {
    sourceResourceKeys.forEach((resourceKey) => readableSourceResourceKeys.add(resourceKey));
  } else if (libraryAccess.allowed) {
    const sourceAccess = await Promise.all(sourceResourceKeys.map(async (resourceKey) => ({
      resourceKey,
      allowed: (await evaluateResourceAuthorization({ userId, resourceKey, action: "read" })).allowed,
    })));
    sourceAccess.forEach(({ resourceKey, allowed }) => {
      if (allowed) readableSourceResourceKeys.add(resourceKey);
    });
  }

  return buildLibraryDocumentAccessPolicy(maxConfidentialityLevel, readableSourceResourceKeys);
}

export async function checkLibraryGeneratedSourceRead(userId: number, generatorKey: string): Promise<boolean> {
  const resourceKey = getLibrarySourceReadRequirement(generatorKey);
  if (!resourceKey) return true;
  return (await evaluateResourceAuthorization({ userId, resourceKey, action: "read" })).allowed;
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
