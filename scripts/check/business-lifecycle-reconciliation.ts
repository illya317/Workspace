import "dotenv/config";

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";

export type LifecycleReconciliationCheck = {
  id: string;
  description: string;
  sql: string;
  usesAsOfDate?: boolean;
};

export type LifecycleReconciliationResult = {
  ok: boolean;
  asOfDate: string;
  scanned: Record<string, number>;
  checks: Array<{
    id: string;
    description: string;
    violations: number;
  }>;
};

export const LIFECYCLE_RECONCILIATION_CHECKS: readonly LifecycleReconciliationCheck[] = [
  projectionCheck("organization.department_projection", "部门归档投射与当前有效版本一致", "Department", "DepartmentEffectiveVersion", "departmentId", "isArchived"),
  projectionCheck("organization.position_projection", "岗位归档投射与当前有效版本一致", "Position", "PositionEffectiveVersion", "positionId", "isArchived"),
  projectionCheck("organization.report_override_projection", "特殊汇报启用投射与当前有效版本一致", "PositionReportOverride", "PositionReportOverrideEffectiveVersion", "positionReportOverrideId", "isActive", true),
  sequenceCheck("organization.department_sequence", "部门 optimistic version 等于最后有效版本序号", "Department", "DepartmentEffectiveVersion", "departmentId"),
  sequenceCheck("organization.position_sequence", "岗位 optimistic version 等于最后有效版本序号", "Position", "PositionEffectiveVersion", "positionId"),
  sequenceCheck("organization.report_override_sequence", "特殊汇报 optimistic version 等于最后有效版本序号", "PositionReportOverride", "PositionReportOverrideEffectiveVersion", "positionReportOverrideId"),
  currentPayloadCheck(
    "organization.department_payload",
    "部门当前展示字段与当前有效版本一致",
    "Department",
    "DepartmentEffectiveVersion",
    "departmentId",
    ["code", "name", "alias", "hierarchyKind", "level", "parentId", "managerPositionId"],
  ),
  currentPayloadCheck(
    "organization.position_payload",
    "岗位当前展示字段与当前有效版本一致",
    "Position",
    "PositionEffectiveVersion",
    "positionId",
    ["code", "name", "alias", "departmentId", "reportToPositionId"],
  ),
  currentPayloadCheck(
    "organization.report_override_payload",
    "特殊汇报当前展示字段与当前有效版本一致",
    "PositionReportOverride",
    "PositionReportOverrideEffectiveVersion",
    "positionReportOverrideId",
    ["departmentId", "reportToPositionId", "headcount", "remark"],
  ),
  {
    id: "contract.current_revision",
    description: "正式合同当前修订指针有效且草稿边界一致",
    sql: `
      SELECT count(*)::int AS violations
      FROM "Contract" contract
      LEFT JOIN "ContractRevision" revision ON revision.id = contract."currentRevisionId"
      WHERE (contract."currentRevisionId" IS NOT NULL AND (
          revision.id IS NULL OR revision."contractId" <> contract.id OR revision."recordState" <> 'confirmed'
        ))
        OR (contract."lifecycleStatus" <> 'draft' AND contract."currentRevisionId" IS NULL)
        OR (contract."lifecycleStatus" = 'draft' AND contract."currentRevisionId" IS NOT NULL)
    `,
  },
  {
    id: "contract.current_snapshot",
    description: "合同当前展示字段与当前不可变修订快照一致",
    sql: `
      SELECT count(*)::int AS violations
      FROM "Contract" contract
      JOIN "ContractRevision" revision ON revision.id = contract."currentRevisionId"
      WHERE (revision."snapshotJson"->>'contractNo') IS DISTINCT FROM contract."contractNo"
        OR (revision."snapshotJson"->>'name') IS DISTINCT FROM contract.name
        OR (revision."snapshotJson"->>'partyA') IS DISTINCT FROM contract."partyA"
        OR (revision."snapshotJson"->>'partyB') IS DISTINCT FROM contract."partyB"
        OR (revision."snapshotJson"->>'shareholder') IS DISTINCT FROM contract.shareholder
        OR NULLIF(revision."snapshotJson"->>'categoryId', '')::int IS DISTINCT FROM contract."categoryId"
        OR (revision."snapshotJson"->>'content') IS DISTINCT FROM contract.content
        OR NULLIF(revision."snapshotJson"->>'owningCompanyId', '')::int IS DISTINCT FROM contract."owningCompanyId"
        OR NULLIF(revision."snapshotJson"->>'ownerDepartmentId', '')::int IS DISTINCT FROM contract."ownerDepartmentId"
        OR NULLIF(revision."snapshotJson"->>'partyAId', '')::int IS DISTINCT FROM contract."partyAId"
        OR NULLIF(revision."snapshotJson"->>'partyBId', '')::int IS DISTINCT FROM contract."partyBId"
        OR NULLIF(revision."snapshotJson"->>'handlerEmployeeId', '')::int IS DISTINCT FROM contract."handlerEmployeeId"
        OR (revision."snapshotJson"->>'signedOn') IS DISTINCT FROM contract."signedOn"::text
        OR (revision."snapshotJson"->>'expiresOn') IS DISTINCT FROM contract."expiresOn"::text
        OR ((revision."snapshotSchemaVersion" >= 2 OR revision."snapshotJson" ? 'signedOnPrecision')
          AND (revision."snapshotJson"->>'signedOnPrecision') IS DISTINCT FROM contract."signedOnPrecision")
        OR ((revision."snapshotSchemaVersion" >= 2 OR revision."snapshotJson" ? 'expiresOnPrecision')
          AND (revision."snapshotJson"->>'expiresOnPrecision') IS DISTINCT FROM contract."expiresOnPrecision")
        OR ((revision."snapshotSchemaVersion" >= 2 OR revision."snapshotJson" ? 'legacySignDateRaw')
          AND (revision."snapshotJson"->>'legacySignDateRaw') IS DISTINCT FROM contract."legacySignDateRaw")
        OR ((revision."snapshotSchemaVersion" >= 2 OR revision."snapshotJson" ? 'legacyEndDateRaw')
          AND (revision."snapshotJson"->>'legacyEndDateRaw') IS DISTINCT FROM contract."legacyEndDateRaw")
        OR (revision."snapshotSchemaVersion" >= 2 AND NOT (
          revision."snapshotJson" ? 'signedOnPrecision'
          AND revision."snapshotJson" ? 'expiresOnPrecision'
          AND revision."snapshotJson" ? 'legacySignDateRaw'
          AND revision."snapshotJson" ? 'legacyEndDateRaw'
        ))
        OR NULLIF(revision."snapshotJson"->>'amount', '')::numeric IS DISTINCT FROM contract.amount
        OR NULLIF(revision."snapshotJson"->>'executedAmount', '')::numeric IS DISTINCT FROM contract."executedAmount"
        OR (revision."snapshotJson"->>'currencyCode') IS DISTINCT FROM contract."currencyCode"
        OR NULLIF(revision."snapshotJson"->>'confidentialityLevel', '')::int IS DISTINCT FROM contract."confidentialityLevel"
        OR (revision."snapshotJson"->>'location') IS DISTINCT FROM contract.location
        OR (revision."snapshotJson"->>'remark') IS DISTINCT FROM contract.remark
    `,
  },
  {
    id: "contract.state_projection",
    description: "合同三个状态轴与最后确认事件一致且没有缺轴",
    sql: `
      WITH latest AS (
        SELECT DISTINCT ON (event."contractId", event.axis)
          event."contractId", event.axis, event."toState"
        FROM "ContractStateEvent" event
        WHERE event."recordState" = 'confirmed'
        ORDER BY event."contractId", event.axis, event."effectiveOn" DESC, event."createdAt" DESC, event.id DESC
      ), mismatched AS (
        SELECT latest."contractId"
        FROM latest
        JOIN "Contract" contract ON contract.id = latest."contractId"
        WHERE (latest.axis = 'lifecycle' AND latest."toState" <> contract."lifecycleStatus")
          OR (latest.axis = 'signature' AND latest."toState" <> contract."signatureStatus")
          OR (latest.axis = 'performance' AND latest."toState" <> contract."performanceStatus")
        UNION
        SELECT contract.id
        FROM "Contract" contract
        WHERE contract."currentRevisionId" IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM (VALUES ('lifecycle'), ('signature'), ('performance')) axis(name)
            WHERE NOT EXISTS (
              SELECT 1 FROM latest
              WHERE latest."contractId" = contract.id AND latest.axis = axis.name
            )
          )
      )
      SELECT count(*)::int AS violations FROM mismatched
    `,
  },
  {
    id: "party.legal_fact_projection",
    description: "主体及公司当前展示字段与当前法定事实修订一致",
    usesAsOfDate: true,
    sql: `
      WITH superseded AS (
        SELECT "supersedesId" AS id FROM "PartyLegalFactRevision" WHERE "supersedesId" IS NOT NULL
      ), ranked AS (
        SELECT revision.*,
          row_number() OVER (
            PARTITION BY revision."partyId"
            ORDER BY revision."effectiveOn" DESC, revision.revision DESC
          ) AS rank
        FROM "PartyLegalFactRevision" revision
        LEFT JOIN superseded ON superseded.id = revision.id
        WHERE superseded.id IS NULL
          AND revision."recordState" = 'confirmed'
          AND revision."effectiveOn" <= $1::date
      )
      SELECT count(*)::int AS violations
      FROM "Party" party
      LEFT JOIN ranked revision ON revision."partyId" = party.id AND revision.rank = 1
      LEFT JOIN "Company" company ON company."partyId" = party.id
      WHERE revision.id IS NULL
        OR revision."subjectType" IS DISTINCT FROM party."subjectType"
        OR revision.name IS DISTINCT FROM party.name
        OR revision."fullName" IS DISTINCT FROM party."fullName"
        OR revision."identityNumber" IS DISTINCT FROM party."identityNumber"
        OR revision."legalRepresentative" IS DISTINCT FROM party."legalRepresentative"
        OR (company.id IS NOT NULL AND (
          revision."registeredCapital" IS DISTINCT FROM company."registeredCapital"
          OR revision."registeredAddress" IS DISTINCT FROM company."registeredAddress"
          OR revision."registeredDate" IS DISTINCT FROM company."registeredDate"
        ))
    `,
  },
  {
    id: "party.legal_fact_sequence",
    description: "主体法定事实修订序号连续",
    sql: `
      SELECT count(*)::int AS violations
      FROM (
        SELECT "partyId", count(*)::int AS count, max(revision)::int AS maximum
        FROM "PartyLegalFactRevision"
        GROUP BY "partyId"
      ) revisions
      WHERE revisions.count <> revisions.maximum
    `,
  },
  {
    id: "external.role_projection",
    description: "客户供应商角色启用投射与当前可用期间一致",
    usesAsOfDate: true,
    sql: `
      WITH superseded AS (
        SELECT "supersedesId" AS id FROM "ExternalPartyRolePeriod" WHERE "supersedesId" IS NOT NULL
      ), current_rows AS (
        SELECT period."roleId", count(*)::int AS count
        FROM "ExternalPartyRolePeriod" period
        LEFT JOIN superseded ON superseded.id = period.id
        WHERE superseded.id IS NULL
          AND period."recordState" = 'confirmed'
          AND (period."validFrom" IS NULL OR period."validFrom" <= $1)
          AND (period."validThrough" IS NULL OR period."validThrough" >= $1)
        GROUP BY period."roleId"
      )
      SELECT count(*)::int AS violations
      FROM "ExternalPartyRole" role
      LEFT JOIN current_rows current_period ON current_period."roleId" = role.id
      WHERE role."isActive" IS DISTINCT FROM (COALESCE(current_period.count, 0) > 0)
        OR COALESCE(current_period.count, 0) > 1
    `,
  },
  {
    id: "external.role_sequence",
    description: "客户供应商角色版本等于最后可用期间序号",
    sql: `
      SELECT count(*)::int AS violations
      FROM "ExternalPartyRole" role
      LEFT JOIN (
        SELECT "roleId", max(sequence)::int AS maximum
        FROM "ExternalPartyRolePeriod"
        GROUP BY "roleId"
      ) period ON period."roleId" = role.id
      WHERE role."availabilityVersion" <> COALESCE(period.maximum, 0)
    `,
  },
  {
    id: "hr.agreement_current_revision",
    description: "员工协议当前内容修订指针有效",
    sql: `
      SELECT count(*)::int AS violations
      FROM "EmploymentAgreement" agreement
      LEFT JOIN "EmploymentAgreementRevision" revision ON revision.id = agreement."currentPublishedRevisionId"
      WHERE agreement."currentPublishedRevisionId" IS NULL
        OR revision.id IS NULL
        OR revision."agreementId" <> agreement.id
        OR revision."recordState" <> 'published'
    `,
  },
  {
    id: "hr.agreement_primary",
    description: "同一员工最多一份已确认主协议",
    sql: `
      SELECT count(*)::int AS violations
      FROM (
        SELECT employment."employeeId"
        FROM "EmploymentAgreement" agreement
        JOIN "Employment" employment ON employment.id = agreement."employmentId"
        WHERE agreement."recordState" = 'confirmed' AND agreement."isPrimary"
        GROUP BY employment."employeeId"
        HAVING count(*) > 1
      ) duplicated
    `,
  },
  {
    id: "hr.agreement_term_sequence",
    description: "员工协议期限序号连续",
    sql: `
      SELECT count(*)::int AS violations
      FROM (
        SELECT "agreementId", count(*)::int AS count, max(sequence)::int AS maximum
        FROM "EmploymentAgreementTerm"
        GROUP BY "agreementId"
      ) terms
      WHERE terms.count <> terms.maximum
    `,
  },
  {
    id: "hr.social_insurance_current",
    description: "同一员工当前最多一条已参保期间",
    usesAsOfDate: true,
    sql: `
      SELECT count(*)::int AS violations
      FROM (
        SELECT "employeeId"
        FROM "EmployeeSocialInsurancePeriod"
        WHERE "recordState" = 'confirmed'
          AND "insuranceStatus" = 'insured'
          AND ("startMonth" IS NULL OR "startMonth" <= date_trunc('month', $1::date)::date)
          AND ("endMonth" IS NULL OR "endMonth" >= date_trunc('month', $1::date)::date)
        GROUP BY "employeeId"
        HAVING count(*) > 1
      ) duplicated
    `,
  },
  {
    id: "hr.social_insurance_version",
    description: "社保期间版本与不可变纠错记录数量一致",
    sql: `
      SELECT count(*)::int AS violations
      FROM "EmployeeSocialInsurancePeriod" period
      LEFT JOIN (
        SELECT "periodId", count(*)::int AS count
        FROM "EmployeeSocialInsurancePeriodRevision"
        GROUP BY "periodId"
      ) revision ON revision."periodId" = period.id
      WHERE period.version <> 1 + COALESCE(revision.count, 0)
    `,
  },
  {
    id: "work.project_membership_sequence",
    description: "项目成员关系版本序号连续",
    sql: `
      SELECT count(*)::int AS violations
      FROM (
        SELECT "membershipUid", count(*)::int AS count, max(sequence)::int AS maximum
        FROM "EmployeeProject"
        GROUP BY "membershipUid"
      ) memberships
      WHERE memberships.count <> memberships.maximum
    `,
  },
] as const;

function projectionCheck(
  id: string,
  description: string,
  anchorTable: string,
  versionTable: string,
  aggregateColumn: string,
  projectionColumn: "isArchived" | "isActive",
  activeProjection = false,
): LifecycleReconciliationCheck {
  return {
    id,
    description,
    usesAsOfDate: true,
    sql: `
      WITH superseded AS (
        SELECT "supersedesId" AS id FROM "${versionTable}" WHERE "supersedesId" IS NOT NULL
      ), current_rows AS (
        SELECT version."${aggregateColumn}", count(*)::int AS count
        FROM "${versionTable}" version
        LEFT JOIN superseded ON superseded.id = version.id
        WHERE superseded.id IS NULL
          AND version."recordState" IN ('confirmed', 'unknown')
          AND (version."validFrom" IS NULL OR version."validFrom" <= $1)
          AND (version."validToExclusive" IS NULL OR version."validToExclusive" > $1)
        GROUP BY version."${aggregateColumn}"
      )
      SELECT count(*)::int AS violations
      FROM "${anchorTable}" anchor
      LEFT JOIN current_rows current_version ON current_version."${aggregateColumn}" = anchor.id
      WHERE anchor."${projectionColumn}" IS DISTINCT FROM ${activeProjection
        ? "(COALESCE(current_version.count, 0) > 0)"
        : "(COALESCE(current_version.count, 0) = 0)"}
        OR COALESCE(current_version.count, 0) > 1
    `,
  };
}

function sequenceCheck(
  id: string,
  description: string,
  anchorTable: string,
  versionTable: string,
  aggregateColumn: string,
): LifecycleReconciliationCheck {
  return {
    id,
    description,
    sql: `
      SELECT count(*)::int AS violations
      FROM "${anchorTable}" anchor
      LEFT JOIN (
        SELECT "${aggregateColumn}", max(sequence)::int AS maximum
        FROM "${versionTable}"
        GROUP BY "${aggregateColumn}"
      ) version ON version."${aggregateColumn}" = anchor.id
      WHERE anchor.version <> COALESCE(version.maximum, 0)
    `,
  };
}

function currentPayloadCheck(
  id: string,
  description: string,
  anchorTable: string,
  versionTable: string,
  aggregateColumn: string,
  columns: readonly string[],
): LifecycleReconciliationCheck {
  const mismatch = columns
    .map((column) => `version."${column}" IS DISTINCT FROM anchor."${column}"`)
    .join("\n        OR ");
  return {
    id,
    description,
    usesAsOfDate: true,
    sql: `
      WITH superseded AS (
        SELECT "supersedesId" AS id FROM "${versionTable}" WHERE "supersedesId" IS NOT NULL
      ), current_versions AS (
        SELECT version.*
        FROM "${versionTable}" version
        LEFT JOIN superseded ON superseded.id = version.id
        WHERE superseded.id IS NULL
          AND version."recordState" IN ('confirmed', 'unknown')
          AND (version."validFrom" IS NULL OR version."validFrom" <= $1)
          AND (version."validToExclusive" IS NULL OR version."validToExclusive" > $1)
      )
      SELECT count(*)::int AS violations
      FROM "${anchorTable}" anchor
      JOIN current_versions version ON version."${aggregateColumn}" = anchor.id
      WHERE ${mismatch}
    `,
  };
}

export function evaluateLifecycleReconciliation(input: {
  asOfDate: string;
  scanned: Record<string, number>;
  checks: LifecycleReconciliationResult["checks"];
}): LifecycleReconciliationResult {
  return { ...input, ok: input.checks.every((check) => check.violations === 0) };
}

function databaseUrl() {
  const value = (process.env.DIRECT_URL || process.env.DATABASE_URL || "").trim();
  if (!/^postgres(?:ql)?:\/\//.test(value)) throw new Error("DIRECT_URL or DATABASE_URL must be a PostgreSQL URL");
  return value;
}

async function loadReconciliation(asOfDate: string) {
  const client = new Client({
    connectionString: databaseUrl(),
    application_name: "workspace-business-lifecycle-reconciliation",
  });
  await client.connect();
  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const totals = await client.query(`
      SELECT
        (SELECT count(*)::int FROM "Department") AS departments,
        (SELECT count(*)::int FROM "Position") AS positions,
        (SELECT count(*)::int FROM "PositionReportOverride") AS report_overrides,
        (SELECT count(*)::int FROM "Contract") AS contracts,
        (SELECT count(*)::int FROM "Party") AS parties,
        (SELECT count(*)::int FROM "ExternalPartyRole") AS external_roles,
        (SELECT count(*)::int FROM "EmploymentAgreement") AS agreements,
        (SELECT count(*)::int FROM "EmployeeSocialInsurancePeriod") AS social_insurance_periods,
        (SELECT count(*)::int FROM "EmployeeProject") AS project_memberships
    `);
    const checks = [];
    for (const check of LIFECYCLE_RECONCILIATION_CHECKS) {
      const result = await client.query(check.sql, check.usesAsOfDate ? [asOfDate] : []);
      if (result.rowCount !== 1 || result.fields.length !== 1) {
        throw new Error(`${check.id} must return exactly one row and one column`);
      }
      const violations = Number(result.rows[0][result.fields[0]!.name]);
      if (!Number.isInteger(violations) || violations < 0) throw new Error(`${check.id} returned an invalid count`);
      checks.push({ id: check.id, description: check.description, violations });
    }
    await client.query("ROLLBACK");
    return evaluateLifecycleReconciliation({ asOfDate, scanned: totals.rows[0], checks });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

function parseArgs(argv: string[]) {
  let asOfDate: string | undefined;
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === "--json") json = true;
    else if (argument === "--as-of") asOfDate = argv[++index];
    else if (argument.startsWith("--as-of=")) asOfDate = argument.slice("--as-of=".length);
    else throw new Error(`unknown argument: ${argument}`);
  }
  return { asOfDate, json };
}

function render(result: LifecycleReconciliationResult) {
  const lines = [
    "Business lifecycle database reconciliation",
    `基准业务日：${result.asOfDate}`,
    `扫描：${Object.entries(result.scanned).map(([key, value]) => `${key}=${value}`).join("，")}`,
  ];
  if (result.ok) return `${lines.join("\n")}\n结果：通过，所有生命周期账本与当前投射一致。\n`;
  lines.push("结果：失败。", ...result.checks
    .filter((check) => check.violations > 0)
    .map((check) => `- ${check.id}: ${check.violations}；${check.description}`));
  return `${lines.join("\n")}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await loadReconciliation(options.asOfDate ?? workspaceBusinessDate(new Date()));
  process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : render(result));
  if (!result.ok) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
