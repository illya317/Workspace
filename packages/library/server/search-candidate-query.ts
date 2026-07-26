import { Prisma } from "@workspace/platform/server/prisma";

export const LIBRARY_DOCUMENT_CANDIDATE_LIMIT = 100;

export type LibraryDocumentCandidateRow = {
  id: number;
  coarseScore: number;
  totalCandidates: number;
};

const COARSE_SCORE = {
  exactDocId: 1_000,
  exactTitle: 800,
  exactFileName: 700,
  docIdTerm: 200,
  titleTerm: 120,
  fileNameTerm: 100,
  summaryTerm: 40,
  formalTagTerm: 60,
  pendingTagTerm: 30,
  pendingMetadataTerm: 20,
  chunkContentTerm: 14,
  chunkHeadingTerm: 36,
  chunkLocatorTerm: 24,
} as const;

function contains(column: Prisma.Sql, term: string) {
  return Prisma.sql`strpos(lower(COALESCE(${column}, '')), lower(${term})) > 0`;
}

export function buildLibraryDocumentCandidateQuery(input: {
  query: string;
  terms: string[];
  maxConfidentialityLevel: number;
  deniedGeneratorKeys?: readonly string[];
  limit?: number;
}) {
  if (input.terms.length === 0) return null;

  const exactScoreParts = [
    Prisma.sql`CASE WHEN lower(v."docId") = lower(${input.query}) THEN ${COARSE_SCORE.exactDocId} ELSE 0 END`,
    Prisma.sql`CASE WHEN lower(COALESCE(v."title", '')) = lower(${input.query}) THEN ${COARSE_SCORE.exactTitle} ELSE 0 END`,
    Prisma.sql`CASE WHEN lower(v."fileName") = lower(${input.query}) THEN ${COARSE_SCORE.exactFileName} ELSE 0 END`,
  ];
  const termScoreParts = input.terms.flatMap((term) => [
    Prisma.sql`CASE WHEN ${contains(Prisma.sql`v."docId"`, term)} THEN ${COARSE_SCORE.docIdTerm} ELSE 0 END`,
    Prisma.sql`CASE WHEN ${contains(Prisma.sql`v."title"`, term)} THEN ${COARSE_SCORE.titleTerm} ELSE 0 END`,
    Prisma.sql`CASE WHEN ${contains(Prisma.sql`v."fileName"`, term)} THEN ${COARSE_SCORE.fileNameTerm} ELSE 0 END`,
    Prisma.sql`CASE WHEN ${contains(Prisma.sql`v."summary"`, term)} THEN ${COARSE_SCORE.summaryTerm} ELSE 0 END`,
    Prisma.sql`CASE WHEN EXISTS (
      SELECT 1
      FROM "LibraryDocumentTag" dt
      INNER JOIN "LibraryTag" t ON t."id" = dt."tagId"
      WHERE dt."documentId" = v."id"
        AND t."status" = 'active'
        AND ${contains(Prisma.sql`t."name"`, term)}
    ) THEN ${COARSE_SCORE.formalTagTerm} ELSE 0 END`,
    Prisma.sql`CASE WHEN EXISTS (
      SELECT 1
      FROM "LibraryTagCandidate" tc
      WHERE tc."documentId" = v."id"
        AND tc."versionId" = v."currentVersionId"
        AND tc."status" = 'pending'
        AND ${contains(Prisma.sql`tc."proposedName"`, term)}
    ) THEN ${COARSE_SCORE.pendingTagTerm} ELSE 0 END`,
    Prisma.sql`CASE WHEN EXISTS (
      SELECT 1
      FROM "LibraryMetadataCandidate" mc
      WHERE mc."documentId" = v."id"
        AND mc."versionId" = v."currentVersionId"
        AND mc."status" = 'pending'
        AND (
          ${contains(Prisma.sql`mc."keywordsJson"`, term)}
          OR ${contains(Prisma.sql`mc."entitiesJson"`, term)}
        )
    ) THEN ${COARSE_SCORE.pendingMetadataTerm} ELSE 0 END`,
    Prisma.sql`CASE WHEN EXISTS (
      SELECT 1
      FROM "LibraryContentChunk" c
      WHERE c."versionId" = v."currentVersionId"
        AND ${contains(Prisma.sql`c."content"`, term)}
    ) THEN ${COARSE_SCORE.chunkContentTerm} ELSE 0 END`,
    Prisma.sql`CASE WHEN EXISTS (
      SELECT 1
      FROM "LibraryContentChunk" c
      WHERE c."versionId" = v."currentVersionId"
        AND ${contains(Prisma.sql`c."headingPathJson"`, term)}
    ) THEN ${COARSE_SCORE.chunkHeadingTerm} ELSE 0 END`,
    Prisma.sql`CASE WHEN EXISTS (
      SELECT 1
      FROM "LibraryContentChunk" c
      WHERE c."versionId" = v."currentVersionId"
        AND ${contains(Prisma.sql`c."locatorJson"`, term)}
    ) THEN ${COARSE_SCORE.chunkLocatorTerm} ELSE 0 END`,
  ]);
  const score = Prisma.sql`(${Prisma.join([...exactScoreParts, ...termScoreParts], " + ")})`;
  const sourcePermissionFilter = input.deniedGeneratorKeys?.length
    ? Prisma.sql`AND (d."generatorKey" IS NULL OR d."generatorKey" NOT IN (${Prisma.join([...input.deniedGeneratorKeys])}))`
    : Prisma.empty;

  return Prisma.sql`
    WITH visibleDocuments AS (
      SELECT
        d."id" AS "id",
        d."docId" AS "docId",
        d."title" AS "title",
        d."fileName" AS "fileName",
        d."summary" AS "summary",
        d."currentVersionId" AS "currentVersionId"
      FROM "LibraryDocument" d
      WHERE d."status" = 'active'
        AND d."confidentialityLevel" <= ${input.maxConfidentialityLevel}
        ${sourcePermissionFilter}
        AND d."currentVersionId" IS NOT NULL
    ), scoredDocuments AS (
      SELECT
        v."id" AS "id",
        v."docId" AS "docId",
        ${score} AS "coarseScore"
      FROM visibleDocuments v
    ), matchingDocuments AS (
      SELECT "id", "docId", "coarseScore"
      FROM scoredDocuments
      WHERE "coarseScore" > 0
    )
    SELECT
      "id",
      "coarseScore",
      COUNT(*) OVER () AS "totalCandidates"
    FROM matchingDocuments
    ORDER BY "coarseScore" DESC, "docId" ASC
    LIMIT ${input.limit ?? LIBRARY_DOCUMENT_CANDIDATE_LIMIT}
  `;
}
