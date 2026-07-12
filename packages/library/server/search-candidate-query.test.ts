import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";

import {
  buildLibraryDocumentCandidateQuery,
  LIBRARY_DOCUMENT_CANDIDATE_LIMIT,
  type LibraryDocumentCandidateRow,
} from "./search-candidate-query";
import { extractLibrarySearchTerms } from "./search-relevance";

test("candidate SQL ranks relevance before its bounded hydrate limit and reports the true count", () => {
  const database = new Database(":memory:");
  try {
    database.exec(`
      CREATE TABLE "LibraryDocument" (
        "id" INTEGER PRIMARY KEY,
        "docId" TEXT NOT NULL,
        "title" TEXT,
        "fileName" TEXT NOT NULL,
        "summary" TEXT,
        "status" TEXT NOT NULL,
        "confidentialityLevel" INTEGER NOT NULL,
        "currentVersionId" INTEGER
      );
      CREATE TABLE "LibraryDocumentTag" ("documentId" INTEGER NOT NULL, "tagId" INTEGER NOT NULL);
      CREATE TABLE "LibraryTag" ("id" INTEGER PRIMARY KEY, "name" TEXT NOT NULL, "status" TEXT NOT NULL);
      CREATE TABLE "LibraryTagCandidate" (
        "documentId" INTEGER NOT NULL,
        "versionId" INTEGER NOT NULL,
        "proposedName" TEXT NOT NULL,
        "status" TEXT NOT NULL
      );
      CREATE TABLE "LibraryMetadataCandidate" (
        "documentId" INTEGER NOT NULL,
        "versionId" INTEGER NOT NULL,
        "keywordsJson" TEXT NOT NULL,
        "entitiesJson" TEXT NOT NULL,
        "status" TEXT NOT NULL
      );
      CREATE TABLE "LibraryContentChunk" (
        "versionId" INTEGER NOT NULL,
        "content" TEXT NOT NULL,
        "headingPathJson" TEXT,
        "locatorJson" TEXT NOT NULL
      );
    `);

    const insertDocument = database.prepare(`
      INSERT INTO "LibraryDocument"
        ("id", "docId", "title", "fileName", "summary", "status", "confidentialityLevel", "currentVersionId")
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertChunk = database.prepare(`
      INSERT INTO "LibraryContentChunk" ("versionId", "content", "headingPathJson", "locatorJson")
      VALUES (?, ?, ?, ?)
    `);
    const insertNoise = database.transaction(() => {
      for (let index = 1; index <= LIBRARY_DOCUMENT_CANDIDATE_LIMIT; index += 1) {
        const docId = `LIB-2026-A${String(index).padStart(4, "0")}`;
        insertDocument.run(index, docId, `普通文件${index}`, `${docId}.pdf`, null, "active", 2, index);
        insertChunk.run(index, "会议文件归档说明。", null, "{}");
      }
    });
    insertNoise();

    const targetId = LIBRARY_DOCUMENT_CANDIDATE_LIMIT + 1;
    insertDocument.run(
      targetId,
      "LIB-2026-B13230D700B3",
      "费用报销管理制度",
      "费用报销管理制度.pdf",
      "规定费用报销的票据及附件要求。",
      "active",
      2,
      targetId,
    );
    insertChunk.run(targetId, "公司主办的内部会议，如有会议供应商，报销时需提供相应文件。", null, "{}");

    const archivedId = targetId + 1;
    const secretId = targetId + 2;
    const noVersionId = targetId + 3;
    const staleVersionId = targetId + 4;
    insertDocument.run(archivedId, "LIB-2026-00ARCHIVED", "费用报销管理制度", "archived.pdf", null, "archived", 2, archivedId);
    insertDocument.run(secretId, "LIB-2026-00SECRET", "费用报销管理制度", "secret.pdf", null, "active", 4, secretId);
    insertDocument.run(noVersionId, "LIB-2026-00NOVERSION", "费用报销管理制度", "no-version.pdf", null, "active", 2, null);
    insertDocument.run(staleVersionId, "LIB-2026-00STALE", "旧版资料", "stale.pdf", null, "active", 2, staleVersionId);
    insertChunk.run(staleVersionId + 1_000, "费用报销管理制度会议供应商文件。", null, "{}");

    const query = "费用报销管理制度会议供应商需要什么文件？";
    const statement = buildLibraryDocumentCandidateQuery({
      query,
      terms: extractLibrarySearchTerms(query),
      maxConfidentialityLevel: 2,
    });
    assert.ok(statement);

    const rows = database.prepare(statement.sql).all(...statement.values) as LibraryDocumentCandidateRow[];

    assert.equal(rows.length, LIBRARY_DOCUMENT_CANDIDATE_LIMIT);
    assert.equal(rows[0].id, targetId);
    assert.equal(Number(rows[0].totalCandidates), LIBRARY_DOCUMENT_CANDIDATE_LIMIT + 1);
    assert.ok(rows.some((row) => row.id === targetId));
    assert.ok(!rows.some((row) => [archivedId, secretId, noVersionId, staleVersionId].includes(row.id)));
  } finally {
    database.close();
  }
});
