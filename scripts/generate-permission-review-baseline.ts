#!/usr/bin/env node

import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";
import { activeWorkspacePackages } from "@workspace/platform/modules";
import {
  type PermissionReviewGrantReference,
  type PermissionReviewResourceTopology,
  type TenantPermissionReviewPolicy,
} from "@workspace/platform/permission-review-policy";
import { PERMISSION_ACTION_KEYS } from "@workspace/platform/permission-actions";

type GrantRow = PermissionReviewGrantReference;

function configRoot() {
  const root = process.env.WORKSPACE_CONFIG_DIR?.trim();
  if (!root || !path.isAbsolute(root)) throw new Error("WORKSPACE_CONFIG_DIR must be an absolute path");
  return fs.realpathSync(root);
}

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
}

function databaseUrl() {
  const value = (process.env.DIRECT_URL || process.env.DATABASE_URL || "").trim();
  if (!/^postgres(?:ql)?:\/\//.test(value)) throw new Error("DIRECT_URL or DATABASE_URL must use PostgreSQL");
  return value;
}

function resourceTopology(): PermissionReviewResourceTopology[] {
  const result: PermissionReviewResourceTopology[] = [];
  for (const pkg of activeWorkspacePackages) {
    const moduleDef = pkg.moduleDef;
    if (!moduleDef?.resourceKey) continue;
    result.push({ resourceKey: moduleDef.resourceKey, parentResourceKey: null });
    for (const child of moduleDef.children ?? []) {
      result.push({ resourceKey: child.resourceKey, parentResourceKey: moduleDef.resourceKey });
    }
  }
  return [...new Map(result.map((item) => [item.resourceKey, item])).values()]
    .sort((left, right) => left.resourceKey.localeCompare(right.resourceKey));
}

function grantKey(grant: PermissionReviewGrantReference) {
  return JSON.stringify([grant.subjectType, grant.subjectKey, grant.resourceKey, grant.actionKey, grant.scopeId]);
}

function defaultSeparationRules(): TenantPermissionReviewPolicy["separationOfDuties"] {
  return [
    { key: "inventory-receipts-maker-reviewer", resourceKey: "inventory.receipts", leftActionKey: "submit", rightActionKey: "approve", description: "成品入库报单制表人与财务复核人分离" },
    { key: "production-qc-maker-reviewer", resourceKey: "production.qc", leftActionKey: "update", rightActionKey: "approve", description: "QC 填报人与复核人分离" },
    { key: "finance-statements-maker-reviewer", resourceKey: "finance.statements", leftActionKey: "submit", rightActionKey: "approve", description: "财务报表编制人与复核人分离" },
    { key: "hr-roster-maker-reviewer", resourceKey: "hr.roster", leftActionKey: "submit", rightActionKey: "approve", description: "人事资料提交人与审批人分离" },
    { key: "docs-template-maker-reviewer", resourceKey: "docs.editor", leftActionKey: "submit", rightActionKey: "approve", description: "模板提交人与审批发布人分离" },
  ];
}

async function main() {
  const root = configRoot();
  const profile = readJson(path.join(root, "config/tenant/profile.json"));
  const files = profile.files as Record<string, string>;
  const policyRelativePath = files.permissionReview || "config/tenant/permission-review.json";
  const policyPath = path.resolve(root, policyRelativePath);
  const previous = fs.existsSync(policyPath)
    ? readJson(policyPath) as Partial<TenantPermissionReviewPolicy>
    : {};
  if (!previous.actorUsername) {
    throw new Error("The private tenant permission-review policy must declare actorUsername before baseline generation");
  }
  const organization = profile.organization as {
    implicitAllAdminEmployeeIds: string[];
    implicitGrantDepartmentKeywords: string[];
  };
  const localization = profile.localization as { businessTimeZone: string };
  const client = new pg.Client({ connectionString: databaseUrl(), application_name: "workspace-permission-review-baseline" });
  await client.connect();
  try {
    const grants = await client.query<GrantRow>(`
      SELECT 'user'::text AS "subjectType", subject.username AS "subjectKey", resource.key AS "resourceKey", grant_row."actionKey", grant_row."scopeId"
      FROM "UserResourceActionGrant" grant_row
      JOIN "User" subject ON subject.id = grant_row."userId"
      JOIN "Resource" resource ON resource.id = grant_row."resourceId"
      WHERE grant_row."actionKey" = ANY($1::text[])
      UNION ALL
      SELECT 'position'::text, subject.code, resource.key, grant_row."actionKey", grant_row."scopeId"
      FROM "PositionResourceActionGrant" grant_row
      JOIN "Position" subject ON subject.id = grant_row."positionId"
      JOIN "Resource" resource ON resource.id = grant_row."resourceId"
      WHERE grant_row."actionKey" = ANY($1::text[])
      UNION ALL
      SELECT 'department'::text, subject.code, resource.key, grant_row."actionKey", grant_row."scopeId"
      FROM "DepartmentResourceActionGrant" grant_row
      JOIN "Department" subject ON subject.id = grant_row."departmentId"
      JOIN "Resource" resource ON resource.id = grant_row."resourceId"
      WHERE grant_row."actionKey" = ANY($1::text[])
      ORDER BY 1, 2, 3, 4, 5 NULLS FIRST
    `, [[...PERMISSION_ACTION_KEYS]]);
    const duplicateGrantKeys = grants.rows
      .map((grant) => grantKey(grant))
      .filter((key, index, keys) => keys.indexOf(key) !== index);
    if (duplicateGrantKeys.length > 0) {
      throw new Error(`Stable subject codes are ambiguous in permission grants: ${[...new Set(duplicateGrantKeys)].join(", ")}`);
    }

    const keywords = organization.implicitGrantDepartmentKeywords;
    const implicitManagers = keywords.length === 0
      ? { rows: [] as Array<{ code: string }> }
      : await client.query<{ code: string }>(`
          SELECT DISTINCT position.code
          FROM "Department" department
          JOIN "Position" position ON position.id = department."managerPositionId"
          WHERE department."isArchived" IS FALSE
            AND EXISTS (
              SELECT 1 FROM unnest($1::text[]) keyword
              WHERE department.name ILIKE '%' || keyword || '%'
                 OR COALESCE(department.alias, '') ILIKE '%' || keyword || '%'
                 OR department.code ILIKE '%' || keyword || '%'
            )
          ORDER BY position.code
        `, [keywords]);
    const recipientUsers = await client.query<{ username: string }>(`
      SELECT DISTINCT "User".username
      FROM "User"
      LEFT JOIN "Employee" ON "Employee"."userId" = "User".id
      WHERE "User".username = 'admin'
         OR "Employee"."employeeId" = ANY($1::text[])
      ORDER BY "User".username
    `, [organization.implicitAllAdminEmployeeIds]);

    const directUsernames = [...new Set(grants.rows
      .filter((grant) => grant.subjectType === "user")
      .map((grant) => grant.subjectKey))].sort();
    const grantedPositionCodes = [...new Set(grants.rows
      .filter((grant) => grant.subjectType === "position")
      .map((grant) => grant.subjectKey))].sort();
    const grantedDepartmentCodes = [...new Set(grants.rows
      .filter((grant) => grant.subjectType === "department")
      .map((grant) => grant.subjectKey))].sort();
    const assignments = await client.query<{
      username: string;
      positionCode: string | null;
      departmentCode: string | null;
    }>(`
      SELECT DISTINCT account.username,
        position.code AS "positionCode",
        department.code AS "departmentCode"
      FROM "User" account
      JOIN "Employee" employee ON employee."userId" = account.id
      JOIN "Employment" employment ON employment."employeeId" = employee.id AND employment."isActive" IS TRUE
      JOIN "EmployeePosition" assignment ON assignment."employeeId" = employee.id
      LEFT JOIN "Position" position ON position.id = assignment."positionId"
        AND position."isArchived" IS FALSE
        AND (position."endDate" IS NULL OR position."endDate" >= CURRENT_DATE)
      LEFT JOIN "Department" department ON department.id = assignment."departmentId"
        AND department."isArchived" IS FALSE
        AND (department."endDate" IS NULL OR department."endDate" >= CURRENT_DATE)
      WHERE (assignment."startDate" IS NULL OR assignment."startDate" = '' OR assignment."startDate" <= to_char(CURRENT_DATE, 'YYYY-MM-DD'))
        AND (assignment."endDate" IS NULL OR assignment."endDate" = '' OR assignment."endDate" >= to_char(CURRENT_DATE, 'YYYY-MM-DD'))
        AND (
          account.username = ANY($1::text[])
          OR position.code = ANY($2::text[])
          OR department.code = ANY($3::text[])
        )
      ORDER BY account.username, position.code, department.code
    `, [directUsernames, grantedPositionCodes, grantedDepartmentCodes]);
    const assignmentsByUser = new Map<string, { positionCodes: Set<string>; departmentCodes: Set<string> }>();
    for (const row of assignments.rows) {
      const current = assignmentsByUser.get(row.username) ?? { positionCodes: new Set<string>(), departmentCodes: new Set<string>() };
      if (row.positionCode) current.positionCodes.add(row.positionCode);
      if (row.departmentCode) current.departmentCodes.add(row.departmentCode);
      assignmentsByUser.set(row.username, current);
    }
    const expectedDirectGrantUserRoles = directUsernames.map((username) => {
      const assignment = assignmentsByUser.get(username);
      return {
        username,
        positionCodes: [...(assignment?.positionCodes ?? [])].sort(),
        departmentCodes: [...(assignment?.departmentCodes ?? [])].sort(),
      };
    });
    const expectedGrantSubjectAssignments = [
      ...grantedPositionCodes.map((subjectKey) => ({
        subjectType: "position" as const,
        subjectKey,
        usernames: assignments.rows
          .filter((row) => row.positionCode === subjectKey)
          .map((row) => row.username)
          .filter((username, index, usernames) => usernames.indexOf(username) === index)
          .sort(),
      })),
      ...grantedDepartmentCodes.map((subjectKey) => ({
        subjectType: "department" as const,
        subjectKey,
        usernames: assignments.rows
          .filter((row) => row.departmentCode === subjectKey)
          .map((row) => row.username)
          .filter((username, index, usernames) => usernames.indexOf(username) === index)
          .sort(),
      })),
    ];

    const policy: TenantPermissionReviewPolicy = {
      version: 1,
      schedule: previous.schedule ?? { dailyAt: "08:00", timeZone: localization.businessTimeZone },
      actorUsername: previous.actorUsername,
      notificationRecipientUsernames: previous.notificationRecipientUsernames
        ?? recipientUsers.rows.map((user) => user.username),
      remindOpenAfterHours: previous.remindOpenAfterHours ?? 24,
      expectedResourceTopology: resourceTopology(),
      expectedGrants: grants.rows,
      expectedDirectGrantUserRoles,
      expectedGrantSubjectAssignments,
      expectedImplicitGrantManagerPositionCodes: implicitManagers.rows.map((position) => position.code),
      separationOfDuties: previous.separationOfDuties ?? defaultSeparationRules(),
    };
    process.stdout.write(`${JSON.stringify(policy, null, 2)}\n`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
