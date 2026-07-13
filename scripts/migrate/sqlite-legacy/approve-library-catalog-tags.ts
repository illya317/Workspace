import path from "node:path";

import Database from "better-sqlite3";

const args = process.argv.slice(2);
const execute = args.includes("--execute");

function argument(name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function resolveDatabasePath() {
  const configured = argument("--db") || process.env.DATABASE_URL?.replace(/^file:/, "");
  if (!configured || !path.isAbsolute(configured)) {
    throw new Error("Use --db <absolute-path> or configure an absolute DATABASE_URL");
  }
  return configured;
}

async function main() {
  const databasePath = resolveDatabasePath();
  const db = new Database(databasePath);
  db.pragma("foreign_keys = ON");

  const scope = `providerKey = 'legacy-index' AND promptVersion = 'catalog-v3'`;
  const summary = db.prepare(`
    SELECT COUNT(*) AS candidates,
      COUNT(DISTINCT documentId) AS documents,
      SUM(CASE WHEN tagId IS NOT NULL THEN 1 ELSE 0 END) AS mapped,
      SUM(CASE WHEN tagId IS NULL THEN 1 ELSE 0 END) AS unmapped,
      SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved
    FROM LibraryTagCandidate
    WHERE ${scope}
  `).get() as { candidates: number; documents: number; mapped: number; unmapped: number; approved: number };
  console.log(JSON.stringify({ mode: execute ? "execute" : "dry-run", scope: "legacy-index/catalog-v3", ...summary }, null, 2));

  if (summary.candidates === 0) throw new Error("No catalog-v3 tag candidates found");
  if (summary.unmapped !== 0 || summary.mapped !== summary.candidates) {
    throw new Error(`Refusing approval: ${summary.unmapped} candidates are not mapped to the formal taxonomy`);
  }
  if (!execute) {
    db.close();
    return;
  }

  const backupPath = `${databasePath}.library-tags-${new Date().toISOString().replace(/[:.]/g, "-")}.bak`;
  await db.backup(backupPath);
  const approve = db.transaction(() => {
    db.prepare(`
      INSERT OR IGNORE INTO LibraryDocumentTag (documentId, tagId, createdBy, createdAt)
      SELECT candidate.documentId, candidate.tagId, NULL, CURRENT_TIMESTAMP
      FROM LibraryTagCandidate candidate
      JOIN LibraryTag tag ON tag.id = candidate.tagId AND tag.status = 'active'
      WHERE candidate.${scope} AND candidate.tagId IS NOT NULL
    `).run();
    db.prepare(`
      UPDATE LibraryTagCandidate
      SET status = 'approved', reviewedAt = CURRENT_TIMESTAMP,
          reviewNote = 'Approved from checksum-matched reviewed catalog v3 by user direction'
      WHERE ${scope} AND tagId IS NOT NULL
    `).run();
  });
  approve();

  const result = db.prepare(`
    SELECT COUNT(*) AS formalLinks, COUNT(DISTINCT documentId) AS documentsWithFormalTags
    FROM LibraryDocumentTag
  `).get() as { formalLinks: number; documentsWithFormalTags: number };
  const distribution = db.prepare(`
    SELECT MIN(tagCount) AS minimum, ROUND(AVG(tagCount), 2) AS average, MAX(tagCount) AS maximum
    FROM (SELECT documentId, COUNT(*) AS tagCount FROM LibraryDocumentTag GROUP BY documentId)
  `).get() as { minimum: number | null; average: number | null; maximum: number | null };
  console.log(JSON.stringify({ backupPath, ...result, distribution }, null, 2));
  db.close();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
