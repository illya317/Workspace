import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { matchText } from "@workspace/platform/search";

import {
  buildLibraryDocumentCandidateQuery,
  type LibraryDocumentCandidateRow,
} from "./search-candidate-query";
import {
  extractLibrarySearchTerms,
  LIBRARY_CHUNK_CANDIDATE_LIMIT,
  LIBRARY_EVIDENCE_LIMIT_PER_DOCUMENT,
  LIBRARY_EVIDENCE_QUOTE_MAX_CHARS,
  rankLibraryChunkCandidates,
  type LibraryChunkCandidate,
} from "./search-relevance";

const QUOTE_CONTEXT_BEFORE_CHARS = 360;

type BoundedChunkRow = {
  versionId: number;
  chunkUid: string;
  ordinal: number;
  locatorJson: string;
  headingPathJson: string | null;
  quote: string;
  quoteStartOneBased: number;
  contentLength: number;
};

function scoreMatch(input: {
  query: string;
  terms: string[];
  docId: string;
  title: string | null;
  fileName: string;
  summary: string | null;
  tags: string[];
  chunks: string[];
  chunkRelevanceScores: number[];
}) {
  const query = input.query.toLocaleLowerCase("zh-CN");
  const text = (value: string | null) => (value || "").toLocaleLowerCase("zh-CN");
  let score = 0;
  if (text(input.docId) === query) score += 120;
  if (text(input.title) === query || text(input.fileName) === query) score += 80;
  score += Math.min(45, input.terms.filter((term) => matchText(input.title || "", term)).length * 30);
  score += Math.min(35, input.terms.filter((term) => matchText(input.fileName, term)).length * 25);
  score += Math.min(20, input.terms.filter((term) => matchText(input.summary || "", term)).length * 12);
  score += Math.min(30, input.tags.filter((tag) => input.terms.some((term) => matchText(tag, term))).length * 15);
  score += Math.min(30, input.chunks.filter((chunk) => input.terms.some((term) => matchText(chunk, term))).length * 10);
  score += Math.min(50, Math.round(Math.max(0, ...input.chunkRelevanceScores) / 4));
  return score;
}

function parseJsonObject(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return { invalidLocator: true };
  }
}

async function readRankedDocumentCandidates(input: {
  query: string;
  terms: string[];
  maxConfidentialityLevel: number;
}) {
  const query = buildLibraryDocumentCandidateQuery(input);
  if (!query) return [];
  return prisma.$queryRaw<LibraryDocumentCandidateRow[]>(query);
}

async function readBoundedChunkCandidates(input: {
  versionIds: number[];
  query: string;
  terms: string[];
  maxConfidentialityLevel: number;
}) {
  if (input.versionIds.length === 0 || input.terms.length === 0) return [];
  const matchPredicates = input.terms.flatMap((term) => [
    Prisma.sql`strpos(lower(c."content"), lower(${term})) > 0`,
    Prisma.sql`strpos(lower(COALESCE(c."headingPathJson", '')), lower(${term})) > 0`,
    Prisma.sql`strpos(lower(c."locatorJson"), lower(${term})) > 0`,
  ]);
  const scoreParts = [
    Prisma.sql`CASE WHEN strpos(lower(c."content"), lower(${input.query})) > 0 THEN 120 ELSE 0 END`,
    Prisma.sql`CASE WHEN strpos(lower(COALESCE(c."headingPathJson", '')), lower(${input.query})) > 0 THEN 180 ELSE 0 END`,
    ...input.terms.flatMap((term) => [
      Prisma.sql`CASE WHEN strpos(lower(c."content"), lower(${term})) > 0 THEN 14 ELSE 0 END`,
      Prisma.sql`CASE WHEN strpos(lower(COALESCE(c."headingPathJson", '')), lower(${term})) > 0 THEN 36 ELSE 0 END`,
      Prisma.sql`CASE WHEN strpos(lower(c."locatorJson"), lower(${term})) > 0 THEN 24 ELSE 0 END`,
    ]),
  ];
  const prioritizedPositions = input.terms.map((term) => Prisma.sql`
    WHEN strpos(lower(c."content"), lower(${term})) > 0
    THEN strpos(lower(c."content"), lower(${term}))
  `);
  const matchPosition = Prisma.sql`
    CASE
      WHEN strpos(lower(c."content"), lower(${input.query})) > 0
      THEN strpos(lower(c."content"), lower(${input.query}))
      ${Prisma.join(prioritizedPositions, " ")}
      ELSE 1
    END
  `;
  const query = Prisma.sql`
    WITH candidateChunks AS (
      SELECT
        c."versionId" AS "versionId",
        c."chunkUid" AS "chunkUid",
        c."ordinal" AS "ordinal",
        c."locatorJson" AS "locatorJson",
        c."headingPathJson" AS "headingPathJson",
        substr(
          c."content",
          GREATEST(1, (${matchPosition}) - ${QUOTE_CONTEXT_BEFORE_CHARS}),
          ${LIBRARY_EVIDENCE_QUOTE_MAX_CHARS}
        ) AS "quote",
        GREATEST(1, (${matchPosition}) - ${QUOTE_CONTEXT_BEFORE_CHARS}) AS "quoteStartOneBased",
        length(c."content") AS "contentLength",
        (${Prisma.join(scoreParts, " + ")}) AS "coarseScore"
      FROM "LibraryContentChunk" c
      INNER JOIN "LibraryDocument" d ON d."currentVersionId" = c."versionId"
      WHERE d."status" = 'active'
        AND d."confidentialityLevel" <= ${input.maxConfidentialityLevel}
        AND c."versionId" IN (${Prisma.join(input.versionIds)})
        AND (${Prisma.join(matchPredicates, " OR ")})
    ), rankedChunks AS (
      SELECT
        *,
        ROW_NUMBER() OVER (
          PARTITION BY "versionId"
          ORDER BY "coarseScore" DESC, "ordinal" ASC, "chunkUid" ASC
        ) AS "candidateRank"
      FROM candidateChunks
    )
    SELECT
      "versionId",
      "chunkUid",
      "ordinal",
      "locatorJson",
      "headingPathJson",
      "quote",
      "quoteStartOneBased",
      "contentLength"
    FROM rankedChunks
    WHERE "candidateRank" <= ${LIBRARY_CHUNK_CANDIDATE_LIMIT}
    ORDER BY "versionId" ASC, "coarseScore" DESC, "ordinal" ASC, "chunkUid" ASC
  `;
  return prisma.$queryRaw<BoundedChunkRow[]>(query);
}

function mapChunkRows(rows: BoundedChunkRow[]) {
  const chunksByVersion = new Map<number, LibraryChunkCandidate[]>();
  for (const row of rows) {
    const quote = String(row.quote ?? "");
    const quoteCharStart = Math.max(0, Number(row.quoteStartOneBased) - 1);
    const contentLength = Math.max(quote.length, Number(row.contentLength));
    const chunk: LibraryChunkCandidate = {
      chunkUid: row.chunkUid,
      ordinal: Number(row.ordinal),
      quote,
      locator: parseJsonObject(row.locatorJson),
      headingPath: parseJsonObject(row.headingPathJson),
      quoteCharStart,
      quoteCharEnd: quoteCharStart + quote.length,
      quoteTruncated: quoteCharStart > 0 || quoteCharStart + quote.length < contentLength,
    };
    const existing = chunksByVersion.get(Number(row.versionId)) ?? [];
    existing.push(chunk);
    chunksByVersion.set(Number(row.versionId), existing);
  }
  return chunksByVersion;
}

export async function queryLibraryDocumentSet(input: {
  query: string;
  limit: number;
  maxConfidentialityLevel: number;
}) {
  const terms = extractLibrarySearchTerms(input.query);
  const candidateRows = await readRankedDocumentCandidates({
    query: input.query,
    terms,
    maxConfidentialityLevel: input.maxConfidentialityLevel,
  });
  const totalCandidates = Number(candidateRows[0]?.totalCandidates ?? 0);
  const candidateOrder = new Map(candidateRows.map((row, index) => [Number(row.id), index]));
  const tagConditions = terms.map((term) => ({ proposedName: { contains: term, mode: "insensitive" as const } }));
  const documents = await prisma.libraryDocument.findMany({
    where: {
      id: { in: candidateRows.map((row) => Number(row.id)) },
      status: "active",
      confidentialityLevel: { lte: input.maxConfidentialityLevel },
      currentVersionId: { not: null },
    },
    select: {
      id: true, documentUid: true, docId: true, title: true, fileName: true, summary: true,
      categoryName: true, confidentialityLevel: true,
      tags: { select: { tag: { select: { name: true } } } },
      currentVersion: {
        select: {
          id: true,
          versionUid: true,
          tagCandidates: {
            where: { status: "pending", OR: tagConditions }, take: 5,
            select: { proposedName: true },
          },
        },
      },
    },
  });
  const chunkRows = await readBoundedChunkCandidates({
    versionIds: documents.map((document) => document.currentVersion!.id),
    query: input.query,
    terms,
    maxConfidentialityLevel: input.maxConfidentialityLevel,
  });
  const chunksByVersion = mapChunkRows(chunkRows);
  const ranked = documents.map((document) => {
    const formalTags = document.tags.map((tag) => tag.tag.name);
    const candidateTags = document.currentVersion!.tagCandidates.map((tag) => tag.proposedName);
    const tags = [...new Set([...formalTags, ...candidateTags])];
    const rankedChunks = rankLibraryChunkCandidates({
      query: input.query,
      terms,
      chunks: chunksByVersion.get(document.currentVersion!.id) ?? [],
    }).slice(0, LIBRARY_EVIDENCE_LIMIT_PER_DOCUMENT);
    const evidence = rankedChunks.map((chunk) => ({
      chunkUid: chunk.chunkUid,
      quote: chunk.quote,
      locator: chunk.locator,
      quoteCharStart: chunk.quoteCharStart,
      quoteCharEnd: chunk.quoteCharEnd,
      quoteTruncated: chunk.quoteTruncated,
    }));
    return {
      score: scoreMatch({
        query: input.query,
        terms,
        docId: document.docId,
        title: document.title,
        fileName: document.fileName,
        summary: document.summary,
        tags,
        chunks: evidence.map((item) => item.quote),
        chunkRelevanceScores: rankedChunks.map((chunk) => chunk.relevanceScore),
      }),
      documentId: document.id,
      versionId: document.currentVersion!.id,
      documentUid: document.documentUid,
      versionUid: document.currentVersion!.versionUid,
      docId: document.docId,
      title: document.title || document.fileName,
      categoryName: document.categoryName,
      confidentialityLevel: document.confidentialityLevel,
      tags: formalTags,
      candidateTags,
      evidence,
    };
  }).sort((left, right) => right.score - left.score
    || (candidateOrder.get(left.documentId) ?? Number.MAX_SAFE_INTEGER)
      - (candidateOrder.get(right.documentId) ?? Number.MAX_SAFE_INTEGER)
    || left.docId.localeCompare(right.docId));
  const selected = ranked.slice(0, input.limit);
  return {
    kind: "document-set" as const,
    query: input.query,
    totalCandidates,
    documents: selected,
    selection: selected.map((document) => ({ documentUid: document.documentUid, versionUid: document.versionUid })),
  };
}
