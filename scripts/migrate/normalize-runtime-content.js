#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");

try {
  require("dotenv/config");
} catch {
  // Production deploy sources .env before running this script.
}

const dryRun = process.argv.includes("--dry-run");
const checkOnly = process.argv.includes("--check");
const LEGACY_METADATA_KEYS = new Set(["legacyBlock", "legacyCell", "legacyPart", "legacyMethodField"]);

function expandHome(value) {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

function databasePath() {
  const url = (process.env.DATABASE_URL || "").trim().replace(/^"|"$/g, "");
  if (!url.startsWith("file:")) throw new Error("DATABASE_URL must use file:");
  const value = expandHome(url.slice(5));
  if (!path.isAbsolute(value)) throw new Error("DATABASE_URL must be absolute");
  return value;
}

function workspaceRoot() {
  const value = expandHome((process.env.WORKSPACE_CONFIG_DIR || "").trim());
  if (!value || !path.isAbsolute(value)) throw new Error("WORKSPACE_CONFIG_DIR must be absolute");
  return value;
}

function libraryRoot() {
  const value = expandHome((process.env.LIBRARY_ROOT || "").split(",")[0].trim());
  if (!value || !path.isAbsolute(value)) throw new Error("LIBRARY_ROOT must be an absolute path");
  return path.resolve(value);
}

function safeResolve(root, relativePath) {
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes("..")) {
    throw new Error(`Unsafe relative path: ${relativePath}`);
  }
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error(`Path escapes root: ${relativePath}`);
  return resolved;
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function atomicCopy(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  try {
    fs.copyFileSync(source, temporary, fs.constants.COPYFILE_EXCL);
    fs.renameSync(temporary, target);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function walkJson(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.isFile() && entry.name.endsWith(".json")) files.push(fullPath);
    }
  };
  walk(root);
  return files;
}

function stripLegacyMetadata(value, counters) {
  if (Array.isArray(value)) {
    for (const item of value) stripLegacyMetadata(item, counters);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const key of Object.keys(value)) {
    if (LEGACY_METADATA_KEYS.has(key)) {
      delete value[key];
      counters.metadataFields += 1;
      continue;
    }
    stripLegacyMetadata(value[key], counters);
  }
}

function slug(value) {
  const normalized = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return normalized || "item";
}

function shanghaiYymmdd(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get("year")}${byType.get("month")}${byType.get("day")}`;
}

function canonicalSpaceLabel(db, row, targetType) {
  if (targetType === "department" || targetType === "committee") {
    const department = db.prepare("SELECT code, name FROM Department WHERE id = ?").get(row.targetId);
    return department?.code || department?.name || row.spaceTitle || targetType;
  }
  if (targetType === "company") {
    return db.prepare("SELECT name FROM Company WHERE id = ?").get(row.targetId)?.name || row.spaceTitle || "company";
  }
  const user = db.prepare("SELECT username FROM User WHERE id = ?").get(row.targetId);
  return user?.username || row.spaceTitle || "user";
}

function canonicalTemplateBase(db, row) {
  const targetType = ["personal", "company", "committee"].includes(row.targetType) ? row.targetType : "department";
  const spaceLabel = slug(canonicalSpaceLabel(db, row, targetType));
  const templateLabel = slug(row.sourceProductKey || row.title || row.type || "template");
  return `data/docs-editor/templates/${targetType}/${row.targetId}-${spaceLabel}/template-${String(row.id).padStart(6, "0")}-${templateLabel}`;
}

function nextContentRefs(configRoot, baseRef, row) {
  if (row.status !== "published") {
    const draftRef = `${baseRef}/drafts/v${String(row.version).padStart(6, "0")}`;
    return { documentContentRef: `${draftRef}/document.json`, fieldModelContentRef: `${draftRef}/field-model.json` };
  }
  const datePrefix = shanghaiYymmdd();
  const versionsPath = path.join(configRoot, ...baseRef.split("/"), "versions");
  const entries = fs.existsSync(versionsPath) ? fs.readdirSync(versionsPath) : [];
  const maxVersion = entries.reduce((max, entry) => {
    const match = entry.match(new RegExp(`^${datePrefix}_v(\\d+)$`));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  const versionRef = `${baseRef}/versions/${datePrefix}_v${maxVersion + 1}`;
  return { documentContentRef: `${versionRef}/document.json`, fieldModelContentRef: `${versionRef}/field-model.json` };
}

function loadAndRehomeTemplates(db, configRoot, counters) {
  const rows = db.prepare(`
    SELECT t.id, t.version, t.status, t.title, t.type, t.sourceProductKey,
           t.documentContentRef, t.fieldModelContentRef,
           s.targetType, s.targetId, s.title AS spaceTitle
    FROM DocumentTemplate t
    JOIN DocumentTemplateSpace s ON s.id = t.spaceId
    WHERE t.deletedAt IS NULL
    ORDER BY t.id
  `).all();
  const update = db.prepare(`
    UPDATE DocumentTemplate
    SET documentContentRef = ?, fieldModelContentRef = ?
    WHERE id = ?
  `);
  for (const row of rows) {
    const structured = [row.documentContentRef, row.fieldModelContentRef]
      .every((ref) => ref && /^data\/docs-editor\/templates\/(department|personal|company|committee)\//.test(ref));
    if (structured) continue;
    if (!row.documentContentRef || !row.fieldModelContentRef) {
      throw new Error(`DocumentTemplate ${row.id} has incomplete content refs`);
    }
    const refs = nextContentRefs(configRoot, canonicalTemplateBase(db, row), row);
    for (const [sourceRef, targetRef] of [
      [row.documentContentRef, refs.documentContentRef],
      [row.fieldModelContentRef, refs.fieldModelContentRef],
    ]) {
      const source = path.join(configRoot, ...sourceRef.split("/"));
      const target = path.join(configRoot, ...targetRef.split("/"));
      if (!fs.existsSync(source)) throw new Error(`DocumentTemplate ${row.id} content missing: ${sourceRef}`);
      if (fs.existsSync(target) && sha256File(source) !== sha256File(target)) {
        throw new Error(`DocumentTemplate ${row.id} canonical content conflicts with source`);
      }
      if (!fs.existsSync(target) && !dryRun && !checkOnly) atomicCopy(source, target);
    }
    counters.flatRefsMigrated += 1;
    row.documentContentRef = refs.documentContentRef;
    row.fieldModelContentRef = refs.fieldModelContentRef;
    if (!dryRun && !checkOnly) update.run(refs.documentContentRef, refs.fieldModelContentRef, row.id);
  }
  return rows;
}

function normalizeDocs(db, configRoot) {
  const counters = {
    jsonFiles: 0,
    changedFiles: 0,
    metadataFields: 0,
    draftDirectories: 0,
    flatContentDirectories: 0,
    flatRefsMigrated: 0,
  };
  const docsRoot = path.join(configRoot, "data", "docs-editor", "templates");
  const rows = loadAndRehomeTemplates(db, configRoot, counters);
  if (fs.existsSync(docsRoot)) {
    const flatDirectories = fs.readdirSync(docsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name));
    counters.flatContentDirectories = flatDirectories.length;
    if (!dryRun && !checkOnly) {
      for (const entry of flatDirectories) {
        fs.rmSync(path.join(docsRoot, entry.name), { recursive: true, force: true });
      }
    }
  }
  for (const filePath of walkJson(docsRoot)) {
    counters.jsonFiles += 1;
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const before = counters.metadataFields;
    stripLegacyMetadata(parsed, counters);
    if (counters.metadataFields === before) continue;
    counters.changedFiles += 1;
    if (!dryRun && !checkOnly) {
      const temporary = `${filePath}.tmp-${process.pid}`;
      fs.writeFileSync(temporary, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
      fs.renameSync(temporary, filePath);
    }
  }

  for (const row of rows) {
    const refs = [row.documentContentRef, row.fieldModelContentRef];
    if (refs.some((ref) => !ref || !/^data\/docs-editor\/templates\/(department|personal|company|committee)\//.test(ref))) {
      throw new Error(`DocumentTemplate ${row.id} still uses an unsupported content ref`);
    }
    const match = row.documentContentRef.match(/^(.*)\/(?:versions|drafts)\//);
    if (!match) throw new Error(`DocumentTemplate ${row.id} has no canonical content base`);
    const base = path.join(configRoot, ...match[1].split("/"));
    const oldDraft = path.join(base, "draft");
    if (!fs.existsSync(oldDraft)) continue;
    const nextDraft = path.join(base, "drafts", `v${String(row.version).padStart(6, "0")}`);
    for (const fileName of ["document.json", "field-model.json"]) {
      const source = path.join(oldDraft, fileName);
      const target = path.join(nextDraft, fileName);
      if (!fs.existsSync(source)) throw new Error(`DocumentTemplate ${row.id} legacy draft is incomplete`);
      if (fs.existsSync(target) && sha256File(source) !== sha256File(target)) {
        throw new Error(`DocumentTemplate ${row.id} has conflicting draft content`);
      }
      if (!fs.existsSync(target) && !dryRun && !checkOnly) atomicCopy(source, target);
    }
    counters.draftDirectories += 1;
    if (!dryRun && !checkOnly) fs.rmSync(oldDraft, { recursive: true, force: true });
  }

  if (checkOnly && counters.metadataFields > 0) {
    throw new Error(`Docs Editor still contains ${counters.metadataFields} legacy metadata field(s)`);
  }
  if (checkOnly && counters.draftDirectories > 0) {
    throw new Error(`Docs Editor still contains ${counters.draftDirectories} legacy draft path(s)`);
  }
  if (checkOnly && counters.flatContentDirectories > 0) {
    throw new Error(`Docs Editor still contains ${counters.flatContentDirectories} flat content path(s)`);
  }
  if (checkOnly && counters.flatRefsMigrated > 0) {
    throw new Error(`Docs Editor still contains ${counters.flatRefsMigrated} flat content ref(s)`);
  }
  return counters;
}

function normalizeLibrary(db, root) {
  const counters = {
    versions: 0,
    migrated: 0,
    verified: 0,
    tombstonesNormalized: 0,
    documentUidsNormalized: 0,
    versionUidsNormalized: 0,
  };
  const rows = db.prepare(`
    SELECT v.id, v.documentId, v.versionUid, v.fileName, v.storagePath, v.fileSizeBytes, v.checksumSha256,
           d.documentUid, d.status, d.currentVersionId
    FROM LibraryDocumentVersion v
    JOIN LibraryDocument d ON d.id = v.documentId
    ORDER BY v.id
  `).all();
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const documentUidById = new Map();
  const updates = [];
  for (const row of rows) {
    counters.versions += 1;
    let documentUid = documentUidById.get(row.documentId);
    if (!documentUid) {
      documentUid = uuidPattern.test(row.documentUid) ? row.documentUid : crypto.randomUUID();
      documentUidById.set(row.documentId, documentUid);
      if (documentUid !== row.documentUid) counters.documentUidsNormalized += 1;
    }
    const versionUid = uuidPattern.test(row.versionUid) ? row.versionUid : crypto.randomUUID();
    if (versionUid !== row.versionUid) counters.versionUidsNormalized += 1;
    const managedPath = path.posix.join(".versions", documentUid, versionUid, path.basename(row.fileName));
    const target = safeResolve(root, managedPath);
    const source = row.storagePath.replace(/\\/g, "/").startsWith(".versions/")
      ? target
      : safeResolve(root, row.storagePath);
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
      if (row.status === "active") {
        throw new Error(`Active Library version ${row.id} source missing: ${row.storagePath}`);
      }
      counters.tombstonesNormalized += 1;
      updates.push({
        id: row.id,
        documentId: row.documentId,
        documentUid,
        versionUid,
        managedPath,
        sourceSize: row.fileSizeBytes,
        sourceHash: row.checksumSha256,
        currentVersionId: null,
      });
      continue;
    }
    const sourceSize = fs.statSync(source).size;
    const sourceHash = sha256File(source);
    if (row.fileSizeBytes != null && Number(row.fileSizeBytes) !== sourceSize) {
      const canRepairCurrentUnhashedVersion = !row.checksumSha256 && Number(row.currentVersionId) === Number(row.id);
      if (!canRepairCurrentUnhashedVersion) {
        throw new Error(`Library version ${row.id} size mismatch: db=${row.fileSizeBytes} file=${sourceSize}`);
      }
    }
    if (row.checksumSha256 && row.checksumSha256 !== sourceHash) {
      throw new Error(`Library version ${row.id} checksum mismatch`);
    }
    if (source !== target) {
      if (fs.existsSync(target)) {
        if (fs.statSync(target).size !== sourceSize || sha256File(target) !== sourceHash) {
          throw new Error(`Library version ${row.id} managed target conflicts with source`);
        }
      } else if (!dryRun && !checkOnly) {
        atomicCopy(source, target);
      }
      counters.migrated += 1;
    } else {
      counters.verified += 1;
    }
    updates.push({
      id: row.id,
      documentId: row.documentId,
      documentUid,
      versionUid,
      managedPath,
      sourceSize,
      sourceHash,
      currentVersionId: row.currentVersionId,
    });
  }

  if (checkOnly && counters.migrated > 0) {
    throw new Error(`Library still contains ${counters.migrated} unmanaged version(s)`);
  }
  if (!dryRun && !checkOnly) {
    const update = db.prepare(`
      UPDATE LibraryDocumentVersion
      SET versionUid = ?, storagePath = ?, fileSizeBytes = ?, checksumSha256 = ?
      WHERE id = ?
    `);
    const updateDocumentUid = db.prepare(`UPDATE LibraryDocument SET documentUid = ? WHERE id = ?`);
    const updateCurrentDocument = db.prepare(`
      UPDATE LibraryDocument
      SET fileSizeBytes = ?, checksumSha256 = ?
      WHERE currentVersionId = ?
    `);
    db.transaction(() => {
      for (const [documentId, documentUid] of documentUidById) updateDocumentUid.run(documentUid, documentId);
      for (const row of updates) {
        update.run(row.versionUid, row.managedPath, row.sourceSize, row.sourceHash, row.id);
        if (Number(row.currentVersionId) === Number(row.id) && row.sourceSize != null && row.sourceHash) {
          updateCurrentDocument.run(row.sourceSize, row.sourceHash, row.id);
        }
      }
    })();
  }
  return counters;
}

function checkFinanceMappings(db) {
  const periods = db.prepare(`
    SELECT DISTINCT p.companyCode, p.year
    FROM FinancePeriod p
    JOIN FinanceAccountBalance b ON b.periodId = p.id
    WHERE p.companyCode IS NOT NULL
    ORDER BY p.companyCode, p.year
  `).all();
  const countMappings = db.prepare(`
    SELECT COUNT(*) AS count
    FROM FinanceStatementAccountMapping
    WHERE companyCode = ? AND year = ? AND statementType = 'balance'
  `);
  const missing = periods.filter((period) => Number(countMappings.get(period.companyCode, period.year).count) === 0);
  if (missing.length > 0) {
    throw new Error(`Finance mapping missing for: ${missing.map((item) => `${item.companyCode}/${item.year}`).join(", ")}`);
  }
  return { periods: periods.length, missing: missing.length };
}

function main() {
  const db = new Database(databasePath());
  db.pragma("foreign_keys = ON");
  try {
    const docs = normalizeDocs(db, workspaceRoot());
    const library = normalizeLibrary(db, libraryRoot());
    const finance = checkFinanceMappings(db);
    process.stdout.write(`${JSON.stringify({ mode: checkOnly ? "check" : dryRun ? "dry-run" : "execute", docs, library, finance }, null, 2)}\n`);
  } finally {
    db.close();
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
}
