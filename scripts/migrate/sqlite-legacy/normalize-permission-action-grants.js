#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

try {
  require("dotenv/config");
} catch {
  // Runtime deploy sources .env before running this script; local runs use dotenv when available.
}

const RENAMED_LEGACY_ACTIONS = ["access", "write", "admin", "withdraw"];
// One-time legacy DB semantic landing before the marker is written. These are
// not new action-registry implication rules; new atomic grants such as delete
// must not imply create/update after this normalization marker exists.
const SEMANTIC_LEGACY_ACTIONS = ["delete", "revise", "submit", "approve"];
const SEMANTIC_MARKER_KEY = "legacy-action-semantics-v1";
const WORKFLOW_MANAGEMENT_MARKER_KEY = "workflow-management-capabilities-v1";
const INCLUDE_LEGACY_SEMANTICS_ARG = "--include-legacy-bundle-semantics";
const CHECK_ARG = "--check";
const STALE_RESOURCE_ALIASES = new Map([
  ["external.investors", "capitalSecurities.investors"],
]);
const GRANT_TABLES = [
  { table: "UserResourceActionGrant", subjectColumn: "userId", subjectType: "user" },
  { table: "PositionResourceActionGrant", subjectColumn: "positionId", subjectType: "position" },
  { table: "DepartmentResourceActionGrant", subjectColumn: "departmentId", subjectType: "department" },
];
const LEDGER_TABLE = "PermissionGrantLedgerEvent";

function resolveDatabasePath() {
  const databaseUrl = (process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  if (!databaseUrl.startsWith("file:")) throw new Error(`DATABASE_URL must use file: ${databaseUrl}`);
  const databasePath = databaseUrl.replace(/^file:/, "").replace(/^"|"$/g, "");
  if (!path.isAbsolute(databasePath)) throw new Error(`DATABASE_URL must be absolute: ${databasePath}`);
  return databasePath;
}

function loadManifest(manifestPath) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(manifest.resources)) throw new Error(`Invalid resource manifest: ${manifestPath}`);
  const resourcesByKey = new Map(manifest.resources.map((resource) => {
    if (!resource.key) throw new Error(`Invalid resource entry: ${JSON.stringify(resource)}`);
    return [resource.key, {
      name: resource.name || resource.key,
      parentKey: resource.parentKey || null,
      supportedActions: Array.isArray(resource.supportedActions) ? resource.supportedActions : [],
      spaceEntryOnly: resource.spaceEntryOnly === true,
      workflowBusinessActionKey: resource.workflowBusinessActionKey || null,
      workflowBusinessResourceKey: resource.workflowBusinessResourceKey || null,
    }];
  }));
  const permissionActions = Array.isArray(manifest.permissionActions)
    ? manifest.permissionActions.filter((actionKey) => typeof actionKey === "string")
    : [...new Set([...resourcesByKey.values()].flatMap((resource) => resource.supportedActions))];
  if (permissionActions.length === 0) throw new Error(`Invalid permission action list in manifest: ${manifestPath}`);
  return { resourcesByKey, permissionActions };
}

function targetActionsFor(actionKey, resourcePolicy) {
  const supported = new Set(resourcePolicy.supportedActions);
  if (resourcePolicy.spaceEntryOnly) return supported.has("entry") ? ["entry"] : [];
  if (actionKey === "access") return supported.has("read") ? ["read"] : supported.has("entry") ? ["entry"] : [];
  if (actionKey === "write") return ["read", "create", "update"].filter((action) => supported.has(action));
  if (actionKey === "delete") return ["read", "create", "update", "delete"].filter((action) => supported.has(action));
  if (actionKey === "revise") return ["read", "create", "update", "revise"].filter((action) => supported.has(action));
  if (actionKey === "submit") return ["read", "create", "reverse", "submit"].filter((action) => supported.has(action));
  if (actionKey === "approve") return ["read", "approve", "reject"].filter((action) => supported.has(action));
  if (actionKey === "withdraw") return supported.has("reverse") ? ["reverse"] : [];
  if (actionKey === "admin") return resourcePolicy.supportedActions.filter((action) => action !== "grant");
  return [];
}

function placeholders(values) {
  return values.map(() => "?").join(",");
}

function tableExists(db, table) {
  return Boolean(db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(table));
}

function ensureMarkerTable(db) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS "PermissionActionNormalization" (
      "key" TEXT PRIMARY KEY,
      "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

function markerTableExists(db) {
  return tableExists(db, "PermissionActionNormalization");
}

function hasMarker(db, key) {
  if (!markerTableExists(db)) return false;
  return Boolean(db.prepare('SELECT "key" FROM "PermissionActionNormalization" WHERE "key" = ?').get(key));
}

function writeMarker(db, key) {
  db.prepare('INSERT OR IGNORE INTO "PermissionActionNormalization" ("key", "appliedAt") VALUES (?, ?)').run(key, new Date().toISOString());
}

function grantExists(db, { table, subjectColumn }, row, actionKey) {
  if (row.scopeId === null) {
    return Boolean(db.prepare(`
      SELECT id FROM ${table}
      WHERE ${subjectColumn} = ? AND resourceId = ? AND actionKey = ? AND scopeId IS NULL
      LIMIT 1
    `).get(row.subjectId, row.resourceId, actionKey));
  }
  return Boolean(db.prepare(`
    SELECT id FROM ${table}
    WHERE ${subjectColumn} = ? AND resourceId = ? AND actionKey = ? AND scopeId = ?
    LIMIT 1
  `).get(row.subjectId, row.resourceId, actionKey, row.scopeId));
}

function insertGrantIfMissing(db, tableConfig, row, actionKey) {
  if (grantExists(db, tableConfig, row, actionKey)) return 0;
  const result = db.prepare(`
    INSERT INTO ${tableConfig.table} (${tableConfig.subjectColumn}, resourceId, actionKey, scopeId)
    VALUES (?, ?, ?, ?)
  `).run(row.subjectId, row.resourceId, actionKey, row.scopeId);
  return result.changes;
}

function resourceAncestorKeys(manifestByKey, resourceKey) {
  const keys = new Set();
  let current = resourceKey;
  while (current && manifestByKey.has(current) && !keys.has(current)) {
    keys.add(current);
    current = manifestByKey.get(current).parentKey;
  }
  return keys;
}

function workflowManagementTargets(db, manifestByKey) {
  const targetsByLegacyResourceKey = new Map();
  for (const [managementResourceKey, resource] of manifestByKey.entries()) {
    if (!resource.workflowBusinessActionKey || !resource.workflowBusinessResourceKey) continue;
    const targetResource = db.prepare("SELECT id, key, name FROM Resource WHERE key = ?").get(managementResourceKey);
    if (!targetResource) throw new Error(`Workflow management resource is not seeded: ${managementResourceKey}`);
    const target = {
      ...targetResource,
      businessActionKey: resource.workflowBusinessActionKey,
      businessResourceKey: resource.workflowBusinessResourceKey,
    };
    for (const legacyResourceKey of resourceAncestorKeys(manifestByKey, resource.workflowBusinessResourceKey)) {
      const targets = targetsByLegacyResourceKey.get(legacyResourceKey) ?? [];
      targets.push(target);
      targetsByLegacyResourceKey.set(legacyResourceKey, targets);
    }
  }
  return targetsByLegacyResourceKey;
}

function insertWorkflowNormalizationLedger(db, input) {
  if (!tableExists(db, LEDGER_TABLE)) return 0;
  return db.prepare(`
    INSERT INTO ${LEDGER_TABLE} (
      eventType, subjectType, subjectId, resourceId, resourceKey, resourceName,
      actionKey, scopeId, beforeValue, afterValue, source, reason, metadataJson
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.eventType,
    input.subjectType,
    input.subjectId,
    input.resourceId,
    input.resourceKey,
    input.resourceName,
    "configure",
    input.scopeId,
    input.beforeValue ? 1 : 0,
    input.afterValue ? 1 : 0,
    "migration",
    "流程管理授权迁移到独立 capability",
    JSON.stringify({
      normalizedBy: "normalize-permission-action-grants",
      normalizationKey: WORKFLOW_MANAGEMENT_MARKER_KEY,
      legacyResourceKey: input.legacyResourceKey,
      businessActionKey: input.businessActionKey ?? null,
    }),
  ).changes;
}

function normalizeWorkflowManagementGrantTable(db, manifestByKey, tableConfig, options = {}) {
  const { table, subjectColumn, subjectType } = tableConfig;
  const targetsByLegacyResourceKey = workflowManagementTargets(db, manifestByKey);
  const rows = db.prepare(`
    SELECT grantRow.id, grantRow.${subjectColumn} AS subjectId, grantRow.resourceId,
           grantRow.scopeId, Resource.key AS resourceKey, Resource.name AS resourceName
    FROM ${table} grantRow
    JOIN Resource ON Resource.id = grantRow.resourceId
    WHERE grantRow.actionKey = 'configure'
    ORDER BY grantRow.id
  `).all();
  const planned = rows.filter((row) => (
    targetsByLegacyResourceKey.has(row.resourceKey) || row.resourceKey.startsWith("space.")
  ));
  const deleteGrant = db.prepare(`DELETE FROM ${table} WHERE id = ?`);
  const summary = {
    table,
    legacyWorkflowRows: planned.length,
    inserted: 0,
    deleted: 0,
    retained: 0,
    scopedDiscarded: 0,
    ledgerEvents: 0,
  };
  const dryRunInsertedKeys = new Set();

  for (const row of planned) {
    const targets = row.scopeId === null ? targetsByLegacyResourceKey.get(row.resourceKey) ?? [] : [];
    if (row.scopeId !== null) summary.scopedDiscarded += 1;
    for (const target of targets) {
      const targetRow = { ...row, resourceId: target.id, scopeId: null };
      const key = JSON.stringify([row.subjectId, target.id, "configure"]);
      if (grantExists(db, tableConfig, targetRow, "configure") || dryRunInsertedKeys.has(key)) continue;
      if (options.dryRun) {
        dryRunInsertedKeys.add(key);
        summary.inserted += 1;
      } else {
        const inserted = insertGrantIfMissing(db, tableConfig, targetRow, "configure");
        summary.inserted += inserted;
        if (inserted) {
          summary.ledgerEvents += insertWorkflowNormalizationLedger(db, {
            eventType: "grant",
            subjectType,
            subjectId: row.subjectId,
            resourceId: target.id,
            resourceKey: target.key,
            resourceName: target.name,
            scopeId: null,
            beforeValue: false,
            afterValue: true,
            legacyResourceKey: row.resourceKey,
            businessActionKey: target.businessActionKey,
          });
        }
      }
    }

    if (isRuntimeActionSupported(manifestByKey, row.resourceKey, "configure")) {
      summary.retained += 1;
      continue;
    }
    if (options.dryRun) {
      summary.deleted += 1;
      continue;
    }
    const deleted = deleteGrant.run(row.id).changes;
    summary.deleted += deleted;
    if (deleted) {
      summary.ledgerEvents += insertWorkflowNormalizationLedger(db, {
        eventType: "revoke",
        subjectType,
        subjectId: row.subjectId,
        resourceId: row.resourceId,
        resourceKey: row.resourceKey,
        resourceName: row.resourceName,
        scopeId: row.scopeId,
        beforeValue: true,
        afterValue: false,
        legacyResourceKey: row.resourceKey,
      });
    }
  }
  return summary;
}

function normalizeTable(db, manifestByKey, tableConfig, actionKeys, options = {}) {
  const { table, subjectColumn } = tableConfig;
  const actionSql = placeholders(actionKeys);
  const rows = db.prepare(`
    SELECT grantRow.id, grantRow.${subjectColumn} AS subjectId, grantRow.resourceId, grantRow.actionKey, grantRow.scopeId, Resource.key AS resourceKey
    FROM ${table} grantRow
    JOIN Resource ON Resource.id = grantRow.resourceId
    WHERE grantRow.actionKey IN (${actionSql})
    ORDER BY grantRow.id
  `).all(...actionKeys);

  const deleteGrant = db.prepare(`DELETE FROM ${table} WHERE id = ?`);
  const planned = rows.map((row) => ({
    row,
    targetActions: manifestByKey.has(row.resourceKey)
      ? targetActionsFor(row.actionKey, manifestByKey.get(row.resourceKey))
      : [],
  }));
  const skippedRows = planned.filter((item) => item.targetActions.length === 0);
  if (skippedRows.length > 0) {
    throw new Error(`Cannot normalize ${table}; ${skippedRows.length} legacy rows have no target actions: ${JSON.stringify(skippedRows.map(({ row }) => ({
      id: row.id,
      subjectId: row.subjectId,
      resourceKey: row.resourceKey,
      actionKey: row.actionKey,
      scopeId: row.scopeId,
    })))}`);
  }

  const summary = { table, legacyRows: rows.length, inserted: 0, deleted: 0, retained: 0, skipped: 0 };
  const dryRunInsertedKeys = new Set();
  const grantKey = (row, actionKey) => JSON.stringify([row.subjectId, row.resourceId, row.scopeId, actionKey]);

  for (const { row, targetActions } of planned) {
    for (const actionKey of targetActions) {
      const key = grantKey(row, actionKey);
      if (grantExists(db, tableConfig, row, actionKey) || dryRunInsertedKeys.has(key)) continue;
      if (options.dryRun) {
        dryRunInsertedKeys.add(key);
        summary.inserted += 1;
      } else {
        summary.inserted += insertGrantIfMissing(db, tableConfig, row, actionKey);
      }
    }
    if (targetActions.includes(row.actionKey)) {
      summary.retained += 1;
      continue;
    }
    summary.deleted += options.dryRun ? 1 : deleteGrant.run(row.id).changes;
  }

  return summary;
}

function normalizeUnsupportedGrantTable(db, manifestByKey, tableConfig, options = {}) {
  const { table, subjectColumn } = tableConfig;
  const rows = db.prepare(`
    SELECT grantRow.id, grantRow.${subjectColumn} AS subjectId, grantRow.resourceId, grantRow.actionKey, grantRow.scopeId, Resource.key AS resourceKey
    FROM ${table} grantRow
    JOIN Resource ON Resource.id = grantRow.resourceId
    ORDER BY grantRow.id
  `).all();
  const deleteGrant = db.prepare(`DELETE FROM ${table} WHERE id = ?`);
  const planned = rows
    .filter((row) => !isRuntimeActionSupported(manifestByKey, row.resourceKey, row.actionKey))
    .map((row) => {
      const policy = manifestByKey.get(row.resourceKey);
      const targetActions = policy?.spaceEntryOnly && policy.supportedActions.includes("entry")
        ? ["entry"]
        : [];
      return { row, targetActions };
    });
  const summary = { table, unsupportedRows: planned.length, inserted: 0, deleted: 0 };
  const dryRunInsertedKeys = new Set();
  const grantKey = (row, actionKey) => JSON.stringify([row.subjectId, row.resourceId, row.scopeId, actionKey]);

  for (const { row, targetActions } of planned) {
    for (const actionKey of targetActions) {
      const key = grantKey(row, actionKey);
      if (grantExists(db, tableConfig, row, actionKey) || dryRunInsertedKeys.has(key)) continue;
      if (options.dryRun) {
        dryRunInsertedKeys.add(key);
        summary.inserted += 1;
      } else {
        summary.inserted += insertGrantIfMissing(db, tableConfig, row, actionKey);
      }
    }
    summary.deleted += options.dryRun ? 1 : deleteGrant.run(row.id).changes;
  }
  return summary;
}

function parseMetadataJson(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return { legacyMetadataJson: value };
  }
}

function metadataWithLegacyAction(row, targetActionKey, targetResource) {
  return JSON.stringify({
    ...parseMetadataJson(row.metadataJson),
    legacyActionKey: row.actionKey,
    normalizedActionKey: targetActionKey,
    legacyResourceKey: targetResource.key === row.resourceKey ? undefined : row.resourceKey,
    normalizedResourceKey: targetResource.key === row.resourceKey ? undefined : targetResource.key,
    normalizedBy: "normalize-permission-action-grants",
    normalizedAt: new Date().toISOString(),
    normalizationSourceEventId: row.id,
  });
}

function ledgerTargetResource(db, manifestByKey, row) {
  const key = manifestByKey.has(row.resourceKey)
    ? row.resourceKey
    : STALE_RESOURCE_ALIASES.get(row.resourceKey);
  if (!key) return null;
  const policy = manifestByKey.get(key);
  if (!policy) return null;
  const dbResource = db.prepare("SELECT id, key, name FROM Resource WHERE key = ?").get(key);
  return {
    id: dbResource?.id ?? row.resourceId ?? null,
    key,
    name: dbResource?.name ?? policy.name ?? row.resourceName ?? key,
    policy,
  };
}

function normalizeLedgerTable(db, manifestByKey, actionKeys, options = {}) {
  if (!tableExists(db, LEDGER_TABLE)) {
    return { table: LEDGER_TABLE, legacyRows: 0, inserted: 0, deleted: 0, retained: 0, skipped: 1 };
  }

  const actionSql = placeholders(actionKeys);
  const rows = db.prepare(`
    SELECT *
    FROM ${LEDGER_TABLE}
    WHERE actionKey IN (${actionSql})
    ORDER BY id
  `).all(...actionKeys);

  const planned = rows.map((row) => ({
    row,
    targetResource: ledgerTargetResource(db, manifestByKey, row),
  })).map((item) => ({
    ...item,
    targetActions: item.targetResource ? targetActionsFor(item.row.actionKey, item.targetResource.policy) : [],
  }));
  const skippedRows = planned.filter((item) => item.targetActions.length === 0);
  if (skippedRows.length > 0) {
    throw new Error(`Cannot normalize ${LEDGER_TABLE}; ${skippedRows.length} legacy rows have no target actions: ${JSON.stringify(skippedRows.map(({ row }) => ({
      id: row.id,
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      resourceKey: row.resourceKey,
      actionKey: row.actionKey,
      scopeId: row.scopeId,
    })))}`);
  }

  const insertLedger = db.prepare(`
    INSERT INTO ${LEDGER_TABLE} (
      eventType,
      actorUserId,
      actorLabel,
      actorSnapshotJson,
      subjectType,
      subjectId,
      subjectLabel,
      subjectSnapshotJson,
      resourceId,
      resourceKey,
      resourceName,
      actionKey,
      scopeId,
      beforeValue,
      afterValue,
      source,
      reason,
      batchId,
      metadataJson,
      createdAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const deleteLedger = db.prepare(`DELETE FROM ${LEDGER_TABLE} WHERE id = ?`);
  const summary = { table: LEDGER_TABLE, legacyRows: rows.length, inserted: 0, deleted: 0, retained: 0, skipped: 0 };

  for (const { row, targetActions, targetResource } of planned) {
    if (!targetResource) continue;
    for (const actionKey of targetActions) {
      if (options.dryRun) {
        summary.inserted += 1;
        continue;
      }
      summary.inserted += insertLedger.run(
        row.eventType,
        row.actorUserId,
        row.actorLabel,
        row.actorSnapshotJson,
        row.subjectType,
        row.subjectId,
        row.subjectLabel,
        row.subjectSnapshotJson,
        targetResource.id,
        targetResource.key,
        targetResource.name,
        actionKey,
        row.scopeId,
        row.beforeValue,
        row.afterValue,
        row.source,
        row.reason,
        row.batchId,
        metadataWithLegacyAction(row, actionKey, targetResource),
        row.createdAt,
      ).changes;
    }
    summary.deleted += options.dryRun ? 1 : deleteLedger.run(row.id).changes;
  }

  return summary;
}

function remainingActions(db, actionKeys) {
  const actionSql = placeholders(actionKeys);
  const sources = [
    `SELECT actionKey FROM UserResourceActionGrant WHERE actionKey IN (${actionSql})`,
    `SELECT actionKey FROM PositionResourceActionGrant WHERE actionKey IN (${actionSql})`,
    `SELECT actionKey FROM DepartmentResourceActionGrant WHERE actionKey IN (${actionSql})`,
  ];
  const params = [...actionKeys, ...actionKeys, ...actionKeys];
  if (tableExists(db, LEDGER_TABLE)) {
    sources.push(`SELECT actionKey FROM ${LEDGER_TABLE} WHERE actionKey IN (${actionSql})`);
    params.push(...actionKeys);
  }
  return db.prepare(`
    SELECT actionKey, COUNT(*) AS count
    FROM (
      ${sources.join("\nUNION ALL ")}
    )
    GROUP BY actionKey
    ORDER BY actionKey
  `).all(...params);
}

function remainingInvalidRuntimeActions(db, permissionActions) {
  const actionSql = placeholders(permissionActions);
  const sources = [];
  const params = [];
  for (const { table } of GRANT_TABLES) {
    sources.push(`
      SELECT '${table}' AS sourceTable, Resource.key AS resourceKey, grantRow.actionKey, COUNT(*) AS count
      FROM ${table} grantRow
      JOIN Resource ON Resource.id = grantRow.resourceId
      WHERE grantRow.actionKey NOT IN (${actionSql})
      GROUP BY Resource.key, grantRow.actionKey
    `);
    params.push(...permissionActions);
  }
  if (tableExists(db, LEDGER_TABLE)) {
    sources.push(`
      SELECT '${LEDGER_TABLE}' AS sourceTable, resourceKey, actionKey, COUNT(*) AS count
      FROM ${LEDGER_TABLE}
      WHERE actionKey NOT IN (${actionSql})
      GROUP BY resourceKey, actionKey
    `);
    params.push(...permissionActions);
  }
  if (sources.length === 0) return [];
  return db.prepare(`
    SELECT sourceTable, resourceKey, actionKey, count
    FROM (
      ${sources.join("\nUNION ALL ")}
    )
    ORDER BY sourceTable, resourceKey, actionKey
  `).all(...params);
}

function runtimeGrantActionGroups(db) {
  const sources = GRANT_TABLES.map(({ table }) => `
    SELECT '${table}' AS sourceTable, Resource.key AS resourceKey, grantRow.actionKey, COUNT(*) AS count
    FROM ${table} grantRow
    JOIN Resource ON Resource.id = grantRow.resourceId
    GROUP BY Resource.key, grantRow.actionKey
  `);
  return db.prepare(`
    SELECT sourceTable, resourceKey, actionKey, count
    FROM (
      ${sources.join("\nUNION ALL ")}
    )
    ORDER BY sourceTable, resourceKey, actionKey
  `).all();
}

function isRuntimeActionSupported(manifestByKey, resourceKey, actionKey) {
  const policy = manifestByKey.get(resourceKey);
  if (!policy) return false;
  if (policy.spaceEntryOnly) return actionKey === "entry" && policy.supportedActions.includes("entry");
  return policy.supportedActions.includes(actionKey);
}

function remainingUnsupportedRuntimeActions(db, manifestByKey) {
  return runtimeGrantActionGroups(db).filter((row) =>
    !isRuntimeActionSupported(manifestByKey, row.resourceKey, row.actionKey),
  );
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const checkOnly = args.includes(CHECK_ARG);
  const includeLegacyBundleSemantics = args.includes(INCLUDE_LEGACY_SEMANTICS_ARG);
  if (checkOnly && (dryRun || includeLegacyBundleSemantics)) {
    throw new Error(`${CHECK_ARG} cannot be combined with --dry-run or ${INCLUDE_LEGACY_SEMANTICS_ARG}`);
  }
  const manifestArg = args.find((arg) => arg !== "--dry-run" && arg !== INCLUDE_LEGACY_SEMANTICS_ARG && arg !== CHECK_ARG);
  const manifestPath = path.resolve(manifestArg || "resource-defs.json");
  const { resourcesByKey: manifestByKey, permissionActions } = loadManifest(manifestPath);
  const db = new Database(resolveDatabasePath());
  try {
    if (checkOnly) {
      const remainingLegacy = remainingActions(db, RENAMED_LEGACY_ACTIONS);
      const remainingInvalid = remainingInvalidRuntimeActions(db, permissionActions);
      const remainingUnsupported = remainingUnsupportedRuntimeActions(db, manifestByKey);
      console.log(JSON.stringify({
        check: true,
        remainingLegacyActions: remainingLegacy,
        remainingInvalidRuntimeActions: remainingInvalid,
        remainingUnsupportedRuntimeActions: remainingUnsupported,
      }, null, 2));
      if (remainingInvalid.length > 0 || remainingUnsupported.length > 0) process.exitCode = 1;
      return;
    }
    const result = db.transaction(() => {
      if (!dryRun) ensureMarkerTable(db);
      const markerAlreadyExists = hasMarker(db, SEMANTIC_MARKER_KEY);
      const workflowMarkerAlreadyExists = hasMarker(db, WORKFLOW_MANAGEMENT_MARKER_KEY);
      const includesOneTimeSemanticLegacyActions = includeLegacyBundleSemantics && !markerAlreadyExists;
      const actionKeys = includesOneTimeSemanticLegacyActions
        ? [...RENAMED_LEGACY_ACTIONS, ...SEMANTIC_LEGACY_ACTIONS]
        : [...RENAMED_LEGACY_ACTIONS];
      const summaries = [
        ...GRANT_TABLES.map((item) => normalizeTable(db, manifestByKey, item, actionKeys, { dryRun })),
        normalizeLedgerTable(db, manifestByKey, actionKeys, { dryRun }),
      ];
      const workflowManagementSummaries = workflowMarkerAlreadyExists
        ? []
        : GRANT_TABLES.map((item) => normalizeWorkflowManagementGrantTable(db, manifestByKey, item, { dryRun }));
      const unsupportedGrantSummaries = GRANT_TABLES.map((item) =>
        normalizeUnsupportedGrantTable(db, manifestByKey, item, { dryRun }),
      );
      if (includesOneTimeSemanticLegacyActions && !dryRun) writeMarker(db, SEMANTIC_MARKER_KEY);
      if (!workflowMarkerAlreadyExists && !dryRun) writeMarker(db, WORKFLOW_MANAGEMENT_MARKER_KEY);
      return {
        dryRun,
        includeLegacyBundleSemantics,
        markerAlreadyExists,
        workflowMarkerAlreadyExists,
        includesOneTimeSemanticLegacyActions,
        summaries,
        workflowManagementSummaries,
        unsupportedGrantSummaries,
      };
    })();
    const remainingLegacy = remainingActions(db, RENAMED_LEGACY_ACTIONS);
    const remainingInvalid = remainingInvalidRuntimeActions(db, permissionActions);
    const remainingUnsupported = remainingUnsupportedRuntimeActions(db, manifestByKey);
    console.log(JSON.stringify({
      ...result,
      remainingLegacyActions: remainingLegacy,
      remainingInvalidRuntimeActions: remainingInvalid,
      remainingUnsupportedRuntimeActions: remainingUnsupported,
    }, null, 2));
    if (!dryRun && (remainingInvalid.length > 0 || remainingUnsupported.length > 0)) process.exitCode = 1;
  } finally {
    db.close();
  }
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
