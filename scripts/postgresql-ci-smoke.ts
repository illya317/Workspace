import "dotenv/config";

import { prisma } from "@workspace/platform/server/prisma";
import {
  buildLibraryDocumentCandidateQuery,
  LIBRARY_DOCUMENT_CANDIDATE_LIMIT,
  type LibraryDocumentCandidateRow,
} from "@workspace/library/server/search-candidate-query";
import { extractLibrarySearchTerms } from "@workspace/library/server/search-relevance";
import { requirePostgresqlCiDatabase } from "./testing/e2e-database";

requirePostgresqlCiDatabase();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
}

async function assertLibraryCandidateQuery() {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE "LibraryDocument" (
      "id" integer PRIMARY KEY, "docId" text NOT NULL, "title" text, "fileName" text NOT NULL,
      "summary" text, "status" text NOT NULL, "confidentialityLevel" integer NOT NULL, "currentVersionId" integer
    ) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE "LibraryDocumentTag" ("documentId" integer NOT NULL, "tagId" integer NOT NULL) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE "LibraryTag" ("id" integer PRIMARY KEY, "name" text NOT NULL, "status" text NOT NULL) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE "LibraryTagCandidate" (
      "documentId" integer NOT NULL, "versionId" integer NOT NULL, "proposedName" text NOT NULL, "status" text NOT NULL
    ) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE "LibraryMetadataCandidate" (
      "documentId" integer NOT NULL, "versionId" integer NOT NULL, "keywordsJson" text NOT NULL,
      "entitiesJson" text NOT NULL, "status" text NOT NULL
    ) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE "LibraryContentChunk" (
      "versionId" integer NOT NULL, "content" text NOT NULL, "headingPathJson" text, "locatorJson" text NOT NULL
    ) ON COMMIT DROP`);

    await tx.$executeRawUnsafe(`
      INSERT INTO "LibraryDocument" ("id", "docId", "title", "fileName", "summary", "status", "confidentialityLevel", "currentVersionId")
      SELECT id, 'LIB-2026-A' || lpad(id::text, 4, '0'), '普通文件' || id::text,
             'LIB-2026-A' || lpad(id::text, 4, '0') || '.pdf', NULL, 'active', 2, id
      FROM generate_series(1, ${LIBRARY_DOCUMENT_CANDIDATE_LIMIT}) AS id
    `);
    await tx.$executeRawUnsafe(`
      INSERT INTO "LibraryContentChunk" ("versionId", "content", "headingPathJson", "locatorJson")
      SELECT id, '会议文件归档说明。', NULL, '{}' FROM generate_series(1, ${LIBRARY_DOCUMENT_CANDIDATE_LIMIT}) AS id
    `);

    const targetId = LIBRARY_DOCUMENT_CANDIDATE_LIMIT + 1;
    await tx.$executeRawUnsafe(`
      INSERT INTO "LibraryDocument" ("id", "docId", "title", "fileName", "summary", "status", "confidentialityLevel", "currentVersionId") VALUES
        (${targetId}, 'LIB-2026-B13230D700B3', '费用报销管理制度', '费用报销管理制度.pdf', '规定费用报销的票据及附件要求。', 'active', 2, ${targetId}),
        (${targetId + 1}, 'LIB-2026-00ARCHIVED', '费用报销管理制度', 'archived.pdf', NULL, 'archived', 2, ${targetId + 1}),
        (${targetId + 2}, 'LIB-2026-00SECRET', '费用报销管理制度', 'secret.pdf', NULL, 'active', 4, ${targetId + 2}),
        (${targetId + 3}, 'LIB-2026-00NOVERSION', '费用报销管理制度', 'no-version.pdf', NULL, 'active', 2, NULL),
        (${targetId + 4}, 'LIB-2026-00STALE', '旧版资料', 'stale.pdf', NULL, 'active', 2, ${targetId + 4})
    `);
    await tx.$executeRawUnsafe(`
      INSERT INTO "LibraryContentChunk" ("versionId", "content", "headingPathJson", "locatorJson") VALUES
        (${targetId}, '公司主办的内部会议，如有会议供应商，报销时需提供相应文件。', NULL, '{}'),
        (${targetId + 1004}, '费用报销管理制度会议供应商文件。', NULL, '{}')
    `);

    const query = "费用报销管理制度会议供应商需要什么文件？";
    const statement = buildLibraryDocumentCandidateQuery({
      query,
      terms: extractLibrarySearchTerms(query),
      maxConfidentialityLevel: 2,
    });
    assert(statement, "CI Library PostgreSQL candidate query is generated");
    const rows = await tx.$queryRaw<LibraryDocumentCandidateRow[]>(statement);
    assert(rows.length === LIBRARY_DOCUMENT_CANDIDATE_LIMIT, "CI Library candidate query applies the hydrate limit");
    assert(rows[0]?.id === targetId, "CI Library PostgreSQL ranking returns the most relevant document first");
    assert(Number(rows[0]?.totalCandidates) === LIBRARY_DOCUMENT_CANDIDATE_LIMIT + 1, "CI Library candidate query reports the full visible match count");
    assert(!rows.some((row) => [targetId + 1, targetId + 2, targetId + 3, targetId + 4].includes(row.id)), "CI Library candidate query enforces visibility and current-version filters");
  }, { timeout: 30_000 });
}

async function main() {
  const probeKey = `PostgreSQLCiSmoke${process.pid}`;
  try {
    const database = await prisma.$queryRaw<Array<{ version: string; foreignKeys: number; unvalidated: number; baseline: number }>>`
      SELECT
        version() AS version,
        (SELECT count(*)::int FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND contype = 'f') AS "foreignKeys",
        (SELECT count(*)::int FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND NOT convalidated) AS unvalidated,
        (SELECT count(*)::int FROM "_prisma_migrations" WHERE migration_name = '20260713000000_postgresql_baseline' AND finished_at IS NOT NULL) AS baseline
    `;
    assert(database[0]?.version.includes("PostgreSQL"), "CI runtime connects to PostgreSQL");
    assert(Number(database[0]?.foreignKeys) >= 207, "CI PostgreSQL baseline foreign keys are present");
    assert(Number(database[0]?.unvalidated) === 0, "CI PostgreSQL constraints are validated");
    assert(Number(database[0]?.baseline) === 1, "CI PostgreSQL baseline migration is applied exactly once");
    assert(await prisma.resource.count() > 0, "CI PostgreSQL resource seed is present");

    await prisma.systemConfig.create({ data: { key: probeKey, value: "temporary" } });
    const caseInsensitive = await prisma.systemConfig.findFirst({
      where: { key: { contains: probeKey.toLowerCase(), mode: "insensitive" } },
      select: { key: true },
    });
    assert(caseInsensitive?.key === probeKey, "CI PostgreSQL case-insensitive contains semantics are active");
    await assertLibraryCandidateQuery();
  } finally {
    await prisma.systemConfig.deleteMany({ where: { key: probeKey } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
