import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLibrarySearchModelContext,
  extractLibrarySearchTerms,
  rankLibraryChunkCandidates,
} from "./search-relevance";

test("extractLibrarySearchTerms keeps useful Chinese phrases from a natural question", () => {
  const terms = extractLibrarySearchTerms("关账制度里对完成时间有什么要求？");

  for (const expected of ["关账", "制度", "完成", "时间"]) {
    assert.ok(terms.includes(expected), `expected terms to include ${expected}: ${terms.join(", ")}`);
  }
  assert.ok(!terms.includes("什么"));
});

test("extractLibrarySearchTerms preserves normalized Latin and numbered identifiers", () => {
  assert.deepEqual(extractLibrarySearchTerms("LIB－2026－001"), ["LIB-2026-001"]);
  const mixedTerms = extractLibrarySearchTerms("请找 LIB-2026-001 的 Q3 版本");
  assert.ok(mixedTerms.includes("LIB-2026-001"));
  assert.ok(mixedTerms.includes("Q3"));
  assert.ok(!mixedTerms.includes("LIB"));
  assert.ok(!mixedTerms.includes("2026"));
});

test("rankLibraryChunkCandidates favors query and heading relevance over ordinal", () => {
  const query = "关账制度里对完成时间有什么要求？";
  const ranked = rankLibraryChunkCandidates({
    query,
    terms: extractLibrarySearchTerms(query),
    chunks: [
      {
        chunkUid: "early",
        ordinal: 0,
        quote: "本制度用于说明财务工作的总体背景。",
        locator: { schemaVersion: "v1", page: 1 },
        headingPath: { path: ["背景"] },
      },
      {
        chunkUid: "relevant",
        ordinal: 9,
        quote: "月末关账必须在次月第三个工作日完成，并留存复核记录。",
        locator: { schemaVersion: "v1", page: 8 },
        headingPath: { path: ["关账制度", "完成时间要求"] },
      },
      {
        chunkUid: "partial",
        ordinal: 3,
        quote: "完成后应通知相关人员。",
        locator: { schemaVersion: "v1", page: 4 },
        headingPath: { path: ["通知"] },
      },
    ],
  });

  assert.equal(ranked[0].chunkUid, "relevant");
  assert.ok(ranked[0].relevanceScore > ranked[1].relevanceScore);
});

test("buildLibrarySearchModelContext keeps exact quotes and locators within budget", () => {
  const firstQuote = `最高相关证据：${"甲".repeat(420)}`;
  const context = buildLibrarySearchModelContext({
    query: "关账完成时间",
    totalCandidates: 5,
    documents: [
      {
        score: 120,
        documentUid: "document-1",
        versionUid: "version-1",
        docId: "LIB-2026-001",
        title: "关账制度",
        evidence: [
          {
            chunkUid: "chunk-1",
            quote: firstQuote,
            locator: { schemaVersion: "v1", page: 8, sectionPath: ["完成时间"] },
            quoteCharStart: 320,
            quoteCharEnd: 320 + firstQuote.length,
            quoteTruncated: true,
          },
          {
            chunkUid: "chunk-2",
            quote: "乙".repeat(900),
            locator: { schemaVersion: "v1", page: 9 },
          },
        ],
      },
      {
        score: 80,
        documentUid: "document-2",
        versionUid: "version-2",
        docId: "LIB-2026-002",
        title: "复核流程",
        evidence: [{
          chunkUid: "chunk-3",
          quote: "丙".repeat(900),
          locator: { schemaVersion: "v1", page: 3 },
        }],
      },
    ],
  }, { maxChars: 1_250 });

  assert.ok(JSON.stringify(context).length <= 1_250);
  assert.equal(context.documents[0].docId, "LIB-2026-001");
  assert.equal(context.documents[0].versionUid, "version-1");
  assert.equal(context.documents[0].evidence[0].quote, firstQuote);
  assert.deepEqual(context.documents[0].evidence[0].locator, {
    schemaVersion: "v1",
    page: 8,
    sectionPath: ["完成时间"],
  });
  assert.ok(context.omitted.evidenceQuotesDueToCharacterBudget > 0);
  assert.ok(context.omitted.candidateDocumentsOutsideResult > 0);
});

test("buildLibrarySearchModelContext keeps document identity when body evidence is unavailable", () => {
  const context = buildLibrarySearchModelContext({
    query: "LIB-2026-001",
    totalCandidates: 1,
    documents: [{
      score: 120,
      documentUid: "document-1",
      versionUid: "version-1",
      docId: "LIB-2026-001",
      title: "关账制度",
      evidence: [],
    }],
  });

  assert.equal(context.candidates.included, 1);
  assert.deepEqual(context.documents, [{
    title: "关账制度",
    docId: "LIB-2026-001",
    documentUid: "document-1",
    versionUid: "version-1",
    evidence: [],
  }]);
  assert.equal(context.omitted.returnedDocumentsWithoutEvidence, 1);
});
