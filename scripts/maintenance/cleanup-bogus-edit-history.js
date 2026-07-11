#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { requireDatabasePath } = require("../lib/database-url");

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^"|"$/g, "");
  }
}

function argValue(name, fallback) {
  const prefix = `${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? time : null;
}

function main() {
  loadEnv();
  const apply = process.argv.includes("--apply");
  const entities = argValue("--entities", "Employee").split(",").map((item) => item.trim()).filter(Boolean);
  const minAgeHours = Number(argValue("--min-age-hours", "1"));
  const includeNoCreatedAt = process.argv.includes("--include-no-created-at-with-followup");
  const minAgeMs = minAgeHours * 60 * 60 * 1000;
  const dbPath = requireDatabasePath();
  const db = new Database(dbPath);

  const selectRows = db.prepare(`
    SELECT id, entityType, entityId, version, createdAt, dataJson
    FROM EditHistory
    WHERE tag IS NULL AND version = 1 AND entityType IN (${entities.map(() => "?").join(",")})
    ORDER BY entityType, CAST(entityId AS INTEGER), id
  `);
  const hasBaseline = db.prepare("SELECT id FROM EditHistory WHERE entityType = ? AND entityId = ? AND tag LIKE 'V0:%' LIMIT 1");
  const laterCount = db.prepare("SELECT COUNT(*) AS count FROM EditHistory WHERE entityType = ? AND entityId = ? AND tag IS NULL AND version > 1");
  const convert = db.prepare("UPDATE EditHistory SET version = 0, tag = 'V0:baseline' WHERE id = ?");

  const candidates = [];
  for (const row of selectRows.all(...entities)) {
    if (hasBaseline.get(row.entityType, row.entityId)) continue;
    let snapshot;
    try {
      snapshot = JSON.parse(row.dataJson);
    } catch {
      continue;
    }
    const historyAt = parseDate(row.createdAt);
    const recordCreatedAt = parseDate(snapshot.createdAt);
    const later = Number(laterCount.get(row.entityType, row.entityId).count || 0);
    const staleCreatedAt = historyAt !== null && recordCreatedAt !== null && historyAt - recordCreatedAt > minAgeMs;
    const noCreatedAtWithFollowup = includeNoCreatedAt && recordCreatedAt === null && later > 0;
    if (!staleCreatedAt && !noCreatedAtWithFollowup) continue;
    candidates.push({
      id: row.id,
      entityType: row.entityType,
      entityId: row.entityId,
      historyAt: row.createdAt,
      recordCreatedAt: snapshot.createdAt || null,
      laterVersions: later,
      displayName: snapshot.name || snapshot.employeeId || snapshot.code || "",
    });
  }

  console.table(candidates);
  console.log(`${apply ? "Converting" : "Dry run"}: ${candidates.length} bogus V1 history rows`);
  if (apply && candidates.length > 0) {
    db.transaction(() => {
      for (const candidate of candidates) convert.run(candidate.id);
    })();
  }
  db.close();
}

main();
