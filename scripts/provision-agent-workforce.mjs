#!/usr/bin/env node

import process from "node:process";
import pg from "pg";
import {
  DEPARTMENT,
  LOCK_NAME,
  MANAGED_WORKSPACE_RESOURCE_GRANTS,
  PARENT_POSITION,
  PROVISIONER_LEDGER_SOURCE,
  VIRTUAL_PERSONNEL_TYPE,
  WORKFORCE,
  agentBusinessDate,
  isAgentDateTimeEndActive,
  isProvisionerCreatedGrantLedgerEvent,
} from "./lib/agent-workforce-specs.mjs";

try {
  await import("dotenv/config");
} catch {
  // Production sources the release .env before invoking this standalone helper.
}

const { Client } = pg;

class ProvisioningError extends Error {}

class DriftError extends Error {
  constructor(actions) {
    super("Agent workforce provisioning drift detected");
    this.actions = actions;
  }
}

function usage() {
  console.log(`Usage: node scripts/provision-agent-workforce.mjs [--execute | --check]

Modes:
  (default)  Read and print the required changes, then roll back.
  --execute  Apply all required changes in one transaction.
  --check    Verify the canonical state without writing; exit nonzero on drift.
  --help     Show this help.`);
}

function parseMode(args) {
  const allowed = new Set(["--execute", "--check", "--help"]);
  const unknown = args.filter((arg) => !allowed.has(arg));
  if (unknown.length > 0) throw new ProvisioningError(`Unknown argument: ${unknown.join(", ")}`);
  if (args.includes("--help")) return "help";
  const selected = ["--execute", "--check"].filter((flag) => args.includes(flag));
  if (selected.length > 1) throw new ProvisioningError("Use only one of --execute or --check");
  if (selected[0] === "--execute") return "execute";
  if (selected[0] === "--check") return "check";
  return "dry-run";
}

function requireDatabaseUrl() {
  const value = (process.env.DIRECT_URL || process.env.DATABASE_URL || "").trim();
  if (!/^postgres(?:ql)?:\/\//.test(value)) {
    throw new ProvisioningError("DIRECT_URL or DATABASE_URL must use PostgreSQL");
  }
  return value;
}

function safeErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "<postgresql-url>")
    .replace(/password\s*=\s*[^\s]+/gi, "password=<redacted>");
}

function numericId(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function sameId(left, right) {
  return numericId(left) === numericId(right);
}

function validateStringArrayJson(value, label) {
  try {
    const parsed = JSON.parse(value);
    if (
      !Array.isArray(parsed)
      || parsed.some((toolKey) => typeof toolKey !== "string" || !toolKey.trim())
      || new Set(parsed).size !== parsed.length
    ) {
      throw new Error("invalid allowlist");
    }
  } catch {
    throw new ProvisioningError(`${label} must be a JSON array of unique non-empty strings`);
  }
}

function addAction(actions, operation, entity, key, fields) {
  actions.push({ operation, entity, key, fields: [...new Set(fields)] });
}

function formatAction(action) {
  const fields = action.fields.length > 0 ? ` (${action.fields.join(", ")})` : "";
  return `${action.operation.toUpperCase()} ${action.entity} ${action.key}${fields}`;
}

function requireAtMostOne(rows, label) {
  if (rows.length > 1) throw new ProvisioningError(`${label} is ambiguous (${rows.length} rows)`);
  return rows[0] ?? null;
}

function requireExactlyOne(rows, label) {
  if (rows.length !== 1) throw new ProvisioningError(`${label} must resolve to exactly one row (found ${rows.length})`);
  return rows[0];
}

async function resolveFoundation(client, runtime) {
  const lock = runtime.lockRows ? " FOR UPDATE" : "";
  const editorUsername = (process.env.AGENT_WORKFORCE_EDITOR_USERNAME || "admin").trim();
  if (!editorUsername) throw new ProvisioningError("AGENT_WORKFORCE_EDITOR_USERNAME cannot be empty");

  const editor = requireExactlyOne((await client.query(
    `SELECT id, username FROM "User" WHERE username = $1${lock}`,
    [editorUsername],
  )).rows, `provisioning editor ${editorUsername}`);

  const department = requireExactlyOne((await client.query(
    `SELECT id, code, name, "hierarchyKind", "isArchived", "endDate"
     FROM "Department" WHERE code = $1${lock}`,
    [DEPARTMENT.code],
  )).rows, `department ${DEPARTMENT.code}`);
  if (
    department.name !== DEPARTMENT.name
    || department.hierarchyKind !== "M"
    || department.isArchived
    || !isAgentDateTimeEndActive(department.endDate, runtime.today)
  ) {
    throw new ProvisioningError(`department ${DEPARTMENT.code} does not match active M-line ${DEPARTMENT.name}`);
  }

  const parentPosition = requireExactlyOne((await client.query(
    `SELECT id, code, name, "departmentId", "isArchived", "endDate"
     FROM "Position" WHERE code = $1${lock}`,
    [PARENT_POSITION.code],
  )).rows, `parent position ${PARENT_POSITION.code}`);
  if (
    parentPosition.name !== PARENT_POSITION.name
    || !sameId(parentPosition.departmentId, department.id)
    || parentPosition.isArchived
    || !isAgentDateTimeEndActive(parentPosition.endDate, runtime.today)
  ) {
    throw new ProvisioningError(`parent position ${PARENT_POSITION.code} does not match active ${PARENT_POSITION.name} in ${DEPARTMENT.code}`);
  }

  const managers = (await client.query(
    `SELECT DISTINCT employee.id, employee."employeeId", employee.name, assignment."reportingCompanyId"
     FROM "Employee" AS employee
     JOIN "EmployeePosition" AS assignment ON assignment."employeeId" = employee.id
     WHERE assignment."positionId" = $1
       AND (assignment."startDate" IS NULL OR assignment."startDate" = '' OR assignment."startDate" <= $2)
       AND (assignment."endDate" IS NULL OR assignment."endDate" = '' OR assignment."endDate" >= $2)
       AND EXISTS (
         SELECT 1 FROM "Employment" AS employment
         WHERE employment."employeeId" = employee.id AND employment."isActive" IS TRUE
       )
     ORDER BY employee."employeeId", employee.id`,
    [parentPosition.id, runtime.today],
  )).rows;
  const manager = requireExactlyOne(managers, `current active occupant of ${PARENT_POSITION.code}`);
  const reportingCompanyId = numericId(manager.reportingCompanyId);
  if (!reportingCompanyId) {
    throw new ProvisioningError(`current active occupant of ${PARENT_POSITION.code} must have a reporting company`);
  }

  const resourceKeys = MANAGED_WORKSPACE_RESOURCE_GRANTS.map((grant) => grant.resourceKey);
  const resources = (await client.query(
    `SELECT id, key, name FROM "Resource" WHERE key = ANY($1::text[])${lock}`,
    [resourceKeys],
  )).rows;
  const resourceByKey = new Map(resources.map((resource) => [resource.key, {
    id: numericId(resource.id),
    key: resource.key,
    name: resource.name,
  }]));
  for (const resourceKey of resourceKeys) {
    if (!resourceByKey.has(resourceKey)) {
      throw new ProvisioningError(`resource ${resourceKey} must exist before Agent workforce provisioning`);
    }
  }

  return {
    editorUserId: numericId(editor.id),
    editorUsername: editor.username,
    departmentId: numericId(department.id),
    reportingCompanyId,
    parentPositionId: numericId(parentPosition.id),
    managerEmployeeId: manager.employeeId,
    resourceByKey,
  };
}

async function createDefaultPositionDescription(client, editorUserId) {
  const result = await client.query(
    `INSERT INTO "PositionDescription"
       ("sourceFile", details, "editedBy", "editedAt", "createdAt", "updatedAt")
     VALUES ('', '{}', $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     RETURNING id`,
    [editorUserId],
  );
  return numericId(result.rows[0].id);
}

async function ensurePosition(client, runtime, foundation, spec) {
  const lock = runtime.lockRows ? " FOR UPDATE" : "";
  const rows = (await client.query(
    `SELECT id, code, name, "departmentId", "positionDescriptionId", "reportToPositionId",
            "isArchived", "archivedAt", "endDate"
     FROM "Position" WHERE code = $1${lock}`,
    [spec.positionCode],
  )).rows;
  const position = requireAtMostOne(rows, `position ${spec.positionCode}`);
  if (!position) {
    const nameCollisions = (await client.query(
      `SELECT id, code FROM "Position"
       WHERE name = $1 AND "departmentId" = $2 AND code <> $3`,
      [spec.roleName, foundation.departmentId, spec.positionCode],
    )).rows;
    if (nameCollisions.length > 0) {
      throw new ProvisioningError(
        `position name ${spec.roleName} already exists in ${DEPARTMENT.code} under another code`,
      );
    }
    addAction(runtime.actions, "create", "Position", spec.positionCode, [
      "name", "departmentId", "reportToPositionId", "positionDescriptionId", "active",
    ]);
    if (!runtime.apply) return { id: null, lifecycleActive: true };
    const descriptionId = await createDefaultPositionDescription(client, foundation.editorUserId);
    const created = await client.query(
      `INSERT INTO "Position"
         (code, name, "departmentId", "positionDescriptionId", "reportToPositionId",
          "isArchived", "archivedAt", "endDate", "editedBy", "editedAt")
       VALUES ($1, $2, $3, $4, $5, FALSE, NULL, NULL, $6, CURRENT_TIMESTAMP)
       RETURNING id`,
      [
        spec.positionCode,
        spec.roleName,
        foundation.departmentId,
        descriptionId,
        foundation.parentPositionId,
        foundation.editorUserId,
      ],
    );
    return { id: numericId(created.rows[0].id), lifecycleActive: true };
  }

  const lifecycleActive = !position.isArchived
    && position.archivedAt === null
    && isAgentDateTimeEndActive(position.endDate, runtime.today);
  // Name, department, reporting line, description and lifecycle are HR-owned
  // after the stable position code has been created.
  return { id: numericId(position.id), lifecycleActive };
}

async function loadUserCandidates(client, runtime, spec, employee) {
  const lock = runtime.lockRows ? " FOR UPDATE" : "";
  const byUsername = requireAtMostOne((await client.query(
    `SELECT id, username, "canLogin", "sessionVersion"
     FROM "User" WHERE username = $1${lock}`,
    [spec.username],
  )).rows, `user username ${spec.username}`);
  const linked = employee?.userId == null
    ? null
    : requireExactlyOne((await client.query(
      `SELECT id, username, "canLogin", "sessionVersion"
       FROM "User" WHERE id = $1${lock}`,
      [employee.userId],
    )).rows, `linked user for employee ${spec.employeeId}`);

  const candidateIds = new Set(
    [byUsername, linked]
      .filter(Boolean)
      .map((candidate) => numericId(candidate.id)),
  );
  if (candidateIds.size > 1) {
    throw new ProvisioningError(`employee ${spec.employeeId} resolves to conflicting Workspace users`);
  }
  if (byUsername && !linked) {
    throw new ProvisioningError(
      `username ${spec.username} already exists without the canonical ${spec.employeeId} binding; refusing to repurpose it`,
    );
  }
  return linked ?? byUsername ?? null;
}

async function ensureIdentity(client, runtime, foundation, spec) {
  const lock = runtime.lockRows ? " FOR UPDATE" : "";
  const employee = requireAtMostOne((await client.query(
    `SELECT id, "employeeId", name, "userId"
     FROM "Employee" WHERE "employeeId" = $1${lock}`,
    [spec.employeeId],
  )).rows, `employee ${spec.employeeId}`);
  let user = await loadUserCandidates(client, runtime, spec, employee);

  if (user) {
    const linkedEmployees = (await client.query(
      `SELECT id, "employeeId" FROM "Employee"
       WHERE "userId" = $1${employee ? " AND id <> $2" : ""}`,
      employee ? [user.id, employee.id] : [user.id],
    )).rows;
    if (linkedEmployees.length > 0) {
      throw new ProvisioningError(`Workspace user ${spec.username} is linked to another employee`);
    }
  }

  if (!user) {
    addAction(runtime.actions, "create", "User", spec.username, ["canLogin=false"]);
    if (runtime.apply) {
      const created = await client.query(
        `INSERT INTO "User" (username, "canLogin")
         VALUES ($1, FALSE)
         RETURNING id, username, "canLogin", "sessionVersion"`,
        [spec.username],
      );
      user = created.rows[0];
    }
  } else {
    const changed = [];
    if (user.username !== spec.username) changed.push("username");
    if (user.canLogin !== false) changed.push("canLogin=false");
    if (changed.length > 0) {
      addAction(runtime.actions, "update", "User", spec.username, changed);
      if (runtime.apply) {
        await client.query(
          `UPDATE "User"
           SET username = $2,
               "canLogin" = FALSE,
               "sessionVersion" = "sessionVersion" + CASE WHEN "canLogin" IS TRUE THEN 1 ELSE 0 END
           WHERE id = $1`,
          [user.id, spec.username],
        );
        user = { ...user, username: spec.username, canLogin: false };
      }
    }
  }

  if (!employee) {
    addAction(runtime.actions, "create", "Employee", spec.employeeId, ["name", "userId"]);
    if (!runtime.apply) return { employeeId: null, userId: user ? numericId(user.id) : null };
    const created = await client.query(
      `INSERT INTO "Employee"
         ("employeeId", name, "userId", "editedBy", "editedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
      [spec.employeeId, spec.displayName, user.id, foundation.editorUserId],
    );
    return { employeeId: numericId(created.rows[0].id), userId: numericId(user.id) };
  }

  if (user && employee.userId == null) {
    addAction(runtime.actions, "update", "Employee", spec.employeeId, ["userId"]);
    if (runtime.apply) {
      await client.query(`UPDATE "Employee" SET "userId" = $2 WHERE id = $1 AND "userId" IS NULL`, [employee.id, user.id]);
      employee.userId = user.id;
    }
  }
  if (!user || !sameId(employee.userId, user.id)) {
    throw new ProvisioningError(
      `employee ${spec.employeeId} no longer matches its canonical non-login user binding; refusing to overwrite HR facts`,
    );
  }
  // Employee display fields are HR-owned after initial creation.
  return { employeeId: numericId(employee.id), userId: user ? numericId(user.id) : null };
}

async function ensureEmployment(client, runtime, foundation, spec, identity) {
  if (identity.employeeId === null) {
    addAction(runtime.actions, "create", "Employment", spec.employeeId, ["isActive", "personnelType"]);
    return;
  }
  const lock = runtime.lockRows ? " FOR UPDATE" : "";
  const rows = (await client.query(
    `SELECT id, "isActive", "personnelType"
     FROM "Employment" WHERE "employeeId" = $1 ORDER BY id${lock}`,
    [identity.employeeId],
  )).rows;
  const active = rows.filter((row) => row.isActive === true);
  if (active.length > 1) {
    throw new ProvisioningError(`employee ${spec.employeeId} has multiple active Employment rows`);
  }
  if (active.length === 1) {
    if (active[0].personnelType !== VIRTUAL_PERSONNEL_TYPE) {
      throw new ProvisioningError(`employee ${spec.employeeId} has an active non-virtual Employment row`);
    }
    return;
  }

  if (rows.some((row) => row.personnelType !== VIRTUAL_PERSONNEL_TYPE)) {
    throw new ProvisioningError(
      `employee ${spec.employeeId} has non-virtual Employment history; refusing to add or reactivate a virtual identity`,
    );
  }

  const inactiveVirtual = rows.filter((row) => row.personnelType === VIRTUAL_PERSONNEL_TYPE);
  if (inactiveVirtual.length > 1) {
    throw new ProvisioningError(`employee ${spec.employeeId} has ambiguous inactive virtual Employment rows`);
  }
  if (inactiveVirtual.length === 1) {
    // An inactive virtual employment is an explicit HR/security suspension.
    // Deployments must never reactivate it.
    return;
  }
  addAction(runtime.actions, "create", "Employment", spec.employeeId, ["isActive", "personnelType"]);
  if (runtime.apply) {
    await client.query(
      `INSERT INTO "Employment" ("employeeId", "isActive", "personnelType", "editedBy", "editedAt")
       VALUES ($1, TRUE, $2, $3, CURRENT_TIMESTAMP)`,
      [identity.employeeId, VIRTUAL_PERSONNEL_TYPE, foundation.editorUserId],
    );
  }
}

async function ensureCurrentAssignment(client, runtime, foundation, spec, identity, position) {
  if (identity.employeeId === null || position.id === null) {
    addAction(runtime.actions, "create", "EmployeePosition", spec.employeeId, [
      "reportingCompanyId", "departmentId", "positionId", "isPrimary", "allocationWeight", "reportTo",
    ]);
    return;
  }
  if (!position.lifecycleActive) {
    // Position archive/end is an explicit HR lifecycle decision.
    return;
  }
  const lock = runtime.lockRows ? " FOR UPDATE" : "";
  const rows = (await client.query(
    `SELECT id, "reportingCompanyId", "departmentId", "positionId", "positionReportOverrideId", "isPrimary",
            "startDate", "endDate", "reportTo", "allocationWeight"
     FROM "EmployeePosition"
     WHERE "employeeId" = $1
     ORDER BY id${lock}`,
    [identity.employeeId],
  )).rows;
  const today = runtime.today;
  const notEnded = rows.filter((row) => !row.endDate || row.endDate >= today);
  const future = notEnded.filter((row) => row.startDate && row.startDate > today);
  if (future.length > 0) {
    throw new ProvisioningError(
      `employee ${spec.employeeId} has a future EmployeePosition row; refusing to rewrite planned assignment`,
    );
  }
  const current = notEnded.filter((row) => !row.startDate || row.startDate <= today);
  if (current.length > 1) {
    throw new ProvisioningError(`employee ${spec.employeeId} has multiple current EmployeePosition rows`);
  }
  const assignment = current[0] ?? null;
  if (!assignment) {
    if (rows.length > 0) {
      throw new ProvisioningError(
        `employee ${spec.employeeId} has active Employment but no current EmployeePosition`,
      );
    }
    addAction(runtime.actions, "create", "EmployeePosition", spec.employeeId, [
      "reportingCompanyId", "departmentId", "positionId", "isPrimary", "allocationWeight", "reportTo",
    ]);
    if (runtime.apply) {
      await client.query(
        `INSERT INTO "EmployeePosition"
           ("employeeId", "reportingCompanyId", "departmentId", "positionId", "positionReportOverrideId", "isPrimary",
            "endDate", "reportTo", "allocationWeight", "editedBy", "editedAt")
         VALUES ($1, $2, $3, $4, NULL, TRUE, NULL, $5, '100', $6, CURRENT_TIMESTAMP)`,
        [
          identity.employeeId,
          foundation.reportingCompanyId,
          foundation.departmentId,
          position.id,
          foundation.managerEmployeeId,
          foundation.editorUserId,
        ],
      );
    }
    return;
  }
  if (!numericId(assignment.reportingCompanyId)) {
    addAction(runtime.actions, "update", "EmployeePosition", spec.employeeId, ["reportingCompanyId"]);
    if (runtime.apply) {
      await client.query(
        `UPDATE "EmployeePosition"
         SET "reportingCompanyId" = $1, "editedBy" = $2, "editedAt" = CURRENT_TIMESTAMP,
             version = version + 1
         WHERE id = $3 AND "reportingCompanyId" IS NULL`,
        [foundation.reportingCompanyId, foundation.editorUserId, assignment.id],
      );
    }
  }
  if (
    !numericId(assignment.departmentId)
    || !numericId(assignment.positionId)
    || assignment.isPrimary !== true
    || Number(assignment.allocationWeight) !== 100
  ) {
    throw new ProvisioningError(
      `employee ${spec.employeeId} current EmployeePosition violates required placement fields`,
    );
  }
  // Existing active assignments are owned by HR. A transfer, reporting-line
  // override or workload change must survive the next deployment.
}

async function ensureAgentProfile(client, runtime, foundation, spec, identity) {
  const lock = runtime.lockRows ? " FOR UPDATE" : "";
  const byKey = requireAtMostOne((await client.query(
    `SELECT id, key, "actorUserId", "displayName", "roleName", responsibilities,
            "allowedToolKeysJson", status
     FROM "AgentProfile" WHERE key = $1${lock}`,
    [spec.profileKey],
  )).rows, `AgentProfile key ${spec.profileKey}`);
  const byActor = identity.userId === null
    ? null
    : requireAtMostOne((await client.query(
      `SELECT id, key, "actorUserId", "displayName", "roleName", responsibilities,
              "allowedToolKeysJson", status
       FROM "AgentProfile" WHERE "actorUserId" = $1${lock}`,
      [identity.userId],
    )).rows, `AgentProfile actor ${spec.username}`);
  if (byKey && byActor && !sameId(byKey.id, byActor.id)) {
    throw new ProvisioningError(`AgentProfile ${spec.profileKey} conflicts with actor ${spec.username}`);
  }
  if (byKey && identity.userId === null) {
    throw new ProvisioningError(`AgentProfile ${spec.profileKey} exists without its canonical actor user`);
  }
  if (byKey && !sameId(byKey.actorUserId, identity.userId)) {
    throw new ProvisioningError(`AgentProfile ${spec.profileKey} belongs to another actor user`);
  }
  const profile = byKey ?? byActor;
  if (!profile) {
    addAction(runtime.actions, "create", "AgentProfile", spec.profileKey, [
      "actorUserId", "displayName", "roleName", "responsibilities", "allowedToolKeysJson", "status",
    ]);
    if (runtime.apply) {
      const created = await client.query(
        `INSERT INTO "AgentProfile"
           (key, "actorUserId", "displayName", "roleName", responsibilities,
            "allowedToolKeysJson", status, "createdBy", "editedBy", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING id`,
        [
          spec.profileKey,
          identity.userId,
          spec.displayName,
          spec.roleName,
          spec.responsibilities,
          JSON.stringify(spec.legacyAllowedToolKeys),
          foundation.editorUserId,
        ],
      );
      return numericId(created.rows[0].id);
    }
    return null;
  }

  if (!sameId(profile.actorUserId, identity.userId) || profile.key !== spec.profileKey) {
    throw new ProvisioningError(
      `AgentProfile ${spec.profileKey} no longer matches its canonical actor binding; refusing to overwrite it`,
    );
  }
  if (!new Set(["active", "suspended"]).has(profile.status)) {
    throw new ProvisioningError(`AgentProfile ${spec.profileKey} has unsupported status ${profile.status}`);
  }
  validateStringArrayJson(profile.allowedToolKeysJson, `AgentProfile ${spec.profileKey} allowedToolKeysJson`);
  // Descriptive fields, tool allowlist and active/suspended state belong to
  // Agent administration after the initial profile has been created.
  return numericId(profile.id);
}

async function ensureRuntimeBindings(client, runtime, foundation, spec, agentProfileId) {
  if (agentProfileId === null) {
    for (const binding of spec.runtimeBindings) {
      addAction(runtime.actions, "create", "AgentRuntimeBinding", `${spec.profileKey}:${binding.runtimeKind}`, [
        "status=active", `interactive=${binding.interactive}`, "capabilityKeysJson", "instructions",
      ]);
    }
    return;
  }

  const lock = runtime.lockRows ? " FOR UPDATE" : "";
  const existing = (await client.query(
    `SELECT id, "runtimeKind", status, interactive, "capabilityKeysJson", instructions
     FROM "AgentRuntimeBinding"
     WHERE "agentProfileId" = $1
     ORDER BY id${lock}`,
    [agentProfileId],
  )).rows;
  const byKind = new Map(existing.map((binding) => [binding.runtimeKind, binding]));

  for (const desired of spec.runtimeBindings) {
    const binding = byKind.get(desired.runtimeKind);
    if (!binding) {
      addAction(runtime.actions, "create", "AgentRuntimeBinding", `${spec.profileKey}:${desired.runtimeKind}`, [
        "status=active", `interactive=${desired.interactive}`, "capabilityKeysJson", "instructions",
      ]);
      if (runtime.apply) {
        await client.query(
          `INSERT INTO "AgentRuntimeBinding"
             ("agentProfileId", "runtimeKind", status, interactive, "capabilityKeysJson", instructions,
              "createdBy", "editedBy", "createdAt", "updatedAt")
           VALUES ($1, $2, 'active', $3, $4, $5, $6, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [
            agentProfileId,
            desired.runtimeKind,
            desired.interactive,
            JSON.stringify(desired.capabilityKeys),
            desired.instructions,
            foundation.editorUserId,
          ],
        );
      }
      continue;
    }
    if (!new Set(["active", "suspended"]).has(binding.status)) {
      throw new ProvisioningError(
        `AgentRuntimeBinding ${spec.profileKey}:${desired.runtimeKind} has unsupported status ${binding.status}`,
      );
    }
    validateStringArrayJson(
      binding.capabilityKeysJson,
      `AgentRuntimeBinding ${spec.profileKey}:${desired.runtimeKind} capabilityKeysJson`,
    );
    if (typeof binding.instructions !== "string" || !binding.instructions.trim()) {
      throw new ProvisioningError(
        `AgentRuntimeBinding ${spec.profileKey}:${desired.runtimeKind} must have non-empty instructions`,
      );
    }
    // Status, interactivity, instructions and capabilities belong to Agent
    // administration after this canonical runtime binding has been created.
  }
}

function managedGrantKey(resourceKey, actionKey) {
  return `${resourceKey}\u0000${actionKey}`;
}

function managedGrantPairs() {
  return MANAGED_WORKSPACE_RESOURCE_GRANTS.flatMap((grant) => (
    grant.actions.map((actionKey) => ({ resourceKey: grant.resourceKey, actionKey }))
  ));
}

function desiredGrantKeys(spec) {
  return new Set(spec.workspaceResourceGrants.flatMap((grant) => (
    grant.actions.map((actionKey) => managedGrantKey(grant.resourceKey, actionKey))
  )));
}

async function reconcilePositionGrant(client, runtime, foundation, spec, position, input) {
  const resource = foundation.resourceByKey.get(input.resourceKey);
  if (!resource) throw new ProvisioningError(`resource ${input.resourceKey} is unavailable`);
  const identity = `${spec.positionCode}:${input.resourceKey}:${input.actionKey}`;
  const lock = runtime.lockRows ? " FOR UPDATE" : "";
  const rows = (await client.query(
    `SELECT id FROM "PositionResourceActionGrant"
     WHERE "positionId" = $1 AND "resourceId" = $2 AND "actionKey" = $3 AND "scopeId" IS NULL${lock}`,
    [position.id, resource.id, input.actionKey],
  )).rows;
  if (rows.length > 1) {
    throw new ProvisioningError(`position grant ${identity} is ambiguous (${rows.length} rows)`);
  }
  const grant = rows[0] ?? null;
  const latestLedger = (await client.query(
    `SELECT id, "eventType", "afterValue", source
     FROM "PermissionGrantLedgerEvent"
     WHERE "subjectType" = 'position'
       AND "subjectId" = $1
       AND "resourceKey" = $2
       AND "actionKey" = $3
       AND "scopeId" IS NULL
     ORDER BY "createdAt" DESC, id DESC
     LIMIT 1${lock}`,
    [position.id, input.resourceKey, input.actionKey],
  )).rows[0] ?? null;

  if (latestLedger?.afterValue === false) {
    if (grant) throw new ProvisioningError(`position grant ${identity} conflicts with its latest revoke ledger event`);
    return;
  }
  if (latestLedger?.afterValue === true && !grant) {
    throw new ProvisioningError(`position grant ${identity} is missing despite an active grant ledger event`);
  }

  if (!input.desired) {
    if (!isProvisionerCreatedGrantLedgerEvent(latestLedger)) return;
    if (!grant) throw new ProvisioningError(`position grant ${identity} is missing despite a provisioner grant event`);
    addAction(runtime.actions, "delete", "PositionGrant", identity, ["scopeId=null"]);
    addAction(runtime.actions, "create", "PermissionGrantLedgerEvent", identity, ["revoke"]);
    if (!runtime.apply) return;
    await client.query(`DELETE FROM "PositionResourceActionGrant" WHERE id = $1`, [grant.id]);
    await insertPositionGrantLedgerEvent(client, foundation, spec, position, resource, input.actionKey, {
      eventType: "revoke",
      beforeValue: true,
      afterValue: false,
      reason: "Remove provisioner-owned Workspace capability from an external-runtime virtual employee",
    });
    return;
  }

  if (latestLedger?.afterValue === true) return;
  if (!grant) {
    addAction(runtime.actions, "create", "PositionGrant", identity, ["scopeId=null"]);
    if (runtime.apply) {
      await client.query(
        `INSERT INTO "PositionResourceActionGrant" ("positionId", "resourceId", "actionKey", "scopeId")
         VALUES ($1, $2, $3, NULL)`,
        [position.id, resource.id, input.actionKey],
      );
    }
  }
  const eventType = grant ? "baseline" : "grant";
  addAction(runtime.actions, "create", "PermissionGrantLedgerEvent", identity, [eventType]);
  if (runtime.apply) {
    await insertPositionGrantLedgerEvent(client, foundation, spec, position, resource, input.actionKey, {
      eventType,
      beforeValue: false,
      afterValue: true,
      reason: "Provision canonical Agent virtual-employee position capability",
    });
  }
}

async function insertPositionGrantLedgerEvent(client, foundation, spec, position, resource, actionKey, event) {
  await client.query(
    `INSERT INTO "PermissionGrantLedgerEvent"
       ("eventType", "actorUserId", "actorLabel", "actorSnapshotJson",
        "subjectType", "subjectId", "subjectLabel", "subjectSnapshotJson",
        "resourceId", "resourceKey", "resourceName", "actionKey", "scopeId",
        "beforeValue", "afterValue", source, reason, "batchId", "metadataJson", "createdAt")
     VALUES ($1, $2, $3, $4, 'position', $5, $6, $7, $8, $9, $10, $11, NULL,
             $12, $13, $14, $15, $16, $17, CURRENT_TIMESTAMP)`,
    [
      event.eventType,
      foundation.editorUserId,
      foundation.editorUsername,
      JSON.stringify({ id: foundation.editorUserId, username: foundation.editorUsername }),
      position.id,
      spec.roleName,
      JSON.stringify({ id: position.id, code: spec.positionCode, name: spec.roleName }),
      resource.id,
      resource.key,
      resource.name,
      actionKey,
      event.beforeValue,
      event.afterValue,
      PROVISIONER_LEDGER_SOURCE,
      event.reason,
      LOCK_NAME,
      JSON.stringify({ employeeId: spec.employeeId, profileKey: spec.profileKey, resourceKey: resource.key }),
    ],
  );
}

async function ensurePositionGrants(client, runtime, foundation, spec, position) {
  if (position.id === null) {
    for (const grant of spec.workspaceResourceGrants) {
      for (const actionKey of grant.actions) {
        const identity = `${spec.positionCode}:${grant.resourceKey}:${actionKey}`;
        addAction(runtime.actions, "create", "PositionGrant", identity, ["scopeId=null"]);
        addAction(runtime.actions, "create", "PermissionGrantLedgerEvent", identity, ["grant"]);
      }
    }
    return;
  }
  if (!position.lifecycleActive) return;

  const desired = desiredGrantKeys(spec);
  for (const grant of managedGrantPairs()) {
    await reconcilePositionGrant(client, runtime, foundation, spec, position, {
      ...grant,
      desired: desired.has(managedGrantKey(grant.resourceKey, grant.actionKey)),
    });
  }
}

async function reconcile(client, options) {
  const runtime = {
    apply: options.apply,
    lockRows: options.lockRows,
    today: options.today,
    actions: [],
  };
  const foundation = await resolveFoundation(client, runtime);
  for (const spec of WORKFORCE) {
    const position = await ensurePosition(client, runtime, foundation, spec);
    const identity = await ensureIdentity(client, runtime, foundation, spec);
    await ensureEmployment(client, runtime, foundation, spec, identity);
    await ensureCurrentAssignment(client, runtime, foundation, spec, identity, position);
    const agentProfileId = await ensureAgentProfile(client, runtime, foundation, spec, identity);
    await ensureRuntimeBindings(client, runtime, foundation, spec, agentProfileId);
    await ensurePositionGrants(client, runtime, foundation, spec, position);
  }
  return runtime.actions;
}

async function run(mode) {
  const client = new Client({
    connectionString: requireDatabaseUrl(),
    application_name: "workspace-agent-workforce-provisioner",
  });
  await client.connect();
  let transactionOpen = false;
  let advisoryLockHeld = false;
  try {
    await client.query("SET lock_timeout = '10s'");
    await client.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [LOCK_NAME]);
    advisoryLockHeld = true;
    if (mode === "execute") {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    } else {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    }
    transactionOpen = true;
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SET LOCAL statement_timeout = '60s'");

    const today = agentBusinessDate(new Date());
    const actions = await reconcile(client, { apply: mode === "execute", lockRows: mode === "execute", today });
    if (mode === "check" && actions.length > 0) throw new DriftError(actions);
    if (mode === "execute") {
      const remaining = await reconcile(client, { apply: false, lockRows: true, today });
      if (remaining.length > 0) throw new DriftError(remaining);
      await client.query("COMMIT");
    } else {
      await client.query("ROLLBACK");
    }
    transactionOpen = false;

    console.log(`[agent-workforce] mode=${mode}`);
    if (mode === "check") {
      console.log(`[agent-workforce] verified ${WORKFORCE.length} virtual employees with no drift`);
      return;
    }
    if (actions.length === 0) {
      console.log("[agent-workforce] no changes required");
      return;
    }
    for (const action of actions) console.log(`[agent-workforce] ${formatAction(action)}`);
    console.log(
      mode === "execute"
        ? `[agent-workforce] applied ${actions.length} change(s)`
        : `[agent-workforce] dry-run found ${actions.length} change(s); transaction rolled back`,
    );
  } catch (error) {
    if (transactionOpen) await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    if (advisoryLockHeld) {
      await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [LOCK_NAME]).catch(() => undefined);
    }
    await client.end();
  }
}

async function main() {
  const mode = parseMode(process.argv.slice(2));
  if (mode === "help") {
    usage();
    return;
  }
  await run(mode);
}

main().catch((error) => {
  if (error instanceof DriftError) {
    console.error("[agent-workforce] drift detected:");
    for (const action of error.actions) console.error(`[agent-workforce] ${formatAction(action)}`);
  } else {
    console.error(`[agent-workforce] ERROR: ${safeErrorMessage(error)}`);
  }
  process.exitCode = 1;
});
