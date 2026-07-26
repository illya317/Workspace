#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

try {
  await import("dotenv/config");
} catch {
  // Production sources .env before invoking this standalone helper.
}

const LEGACY_ACTIONS = new Set(["access", "write", "admin", "withdraw"]);
const GRANT_TABLES = ["UserResourceActionGrant", "PositionResourceActionGrant", "DepartmentResourceActionGrant"];

function requireDatabaseUrl() {
  const value = (process.env.DIRECT_URL || process.env.DATABASE_URL || "").trim();
  if (!/^postgres(?:ql)?:\/\//.test(value)) throw new Error("DIRECT_URL or DATABASE_URL must use PostgreSQL");
  return value;
}

function loadManifest(manifestPath) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(manifest.resources)) throw new Error(`Invalid resource manifest: ${manifestPath}`);
  const resources = new Map(manifest.resources.map((resource) => [resource.key, {
    supportedActions: Array.isArray(resource.supportedActions) ? resource.supportedActions : [],
    spaceEntryOnly: resource.spaceEntryOnly === true,
  }]));
  const permissionActions = new Set(
    Array.isArray(manifest.permissionActions)
      ? manifest.permissionActions.filter((value) => typeof value === "string")
      : [...resources.values()].flatMap((resource) => resource.supportedActions),
  );
  if (permissionActions.size === 0) throw new Error("Resource manifest has no permission actions");
  return { resources, permissionActions };
}

function supported(resources, resourceKey, actionKey) {
  const policy = resources.get(resourceKey);
  if (!policy) return false;
  if (policy.spaceEntryOnly) return actionKey === "entry" && policy.supportedActions.includes("entry");
  return policy.supportedActions.includes(actionKey);
}

async function groupedGrantActions(client) {
  const groups = [];
  for (const table of GRANT_TABLES) {
    const result = await client.query(`
      SELECT $1::text AS "sourceTable", resource.key AS "resourceKey", grant_row."actionKey", count(*)::int AS count
      FROM "${table}" AS grant_row
      JOIN "Resource" AS resource ON resource.id = grant_row."resourceId"
      GROUP BY resource.key, grant_row."actionKey"
      ORDER BY resource.key, grant_row."actionKey"
    `, [table]);
    groups.push(...result.rows);
  }
  return groups;
}

async function main() {
  const manifestPath = path.resolve(process.argv[2] || "resource-defs.json");
  const { resources, permissionActions } = loadManifest(manifestPath);
  const client = new pg.Client({ connectionString: requireDatabaseUrl(), application_name: "workspace-permission-action-check" });
  await client.connect();
  try {
    const grantGroups = await groupedGrantActions(client);
    const ledger = await client.query(`
      SELECT 'PermissionGrantLedgerEvent'::text AS "sourceTable", "resourceKey", "actionKey", count(*)::int AS count
      FROM "PermissionGrantLedgerEvent"
      GROUP BY "resourceKey", "actionKey"
      ORDER BY "resourceKey", "actionKey"
    `);
    const allGroups = [...grantGroups, ...ledger.rows];
    const remainingLegacyActions = allGroups.filter((row) => LEGACY_ACTIONS.has(row.actionKey));
    const remainingInvalidRuntimeActions = allGroups.filter((row) => !permissionActions.has(row.actionKey));
    const remainingUnsupportedRuntimeActions = grantGroups.filter((row) => !supported(resources, row.resourceKey, row.actionKey));
    console.log(JSON.stringify({
      check: true,
      remainingLegacyActions,
      remainingInvalidRuntimeActions,
      remainingUnsupportedRuntimeActions,
    }, null, 2));
    if (remainingInvalidRuntimeActions.length > 0 || remainingUnsupportedRuntimeActions.length > 0) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
