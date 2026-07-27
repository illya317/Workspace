import { LATEST_INCLUSIVE_BUSINESS_DATE } from "@workspace/platform/contracts/business-temporal";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import {
  filterContracts,
  normalizeContractRecord,
  paginateContracts,
  parseContracts,
  type PaginatedContracts,
} from "./contract-records";
import { buildLegacyAgreementRows } from "./employment-agreement-legacy";
import {
  listAllNormalizedEmploymentAgreementRows,
  loadNormalizedEmploymentAgreementRowsByIds,
} from "./employment-agreements";
import {
  employmentTemporalPosition,
} from "./domain/employee-business-temporal";
import { employeePositionFilterInclude, employeePositionMatches } from "./employee-position-filters";

export {
  normalizeContractRecord,
  parseContracts,
};
export type { PaginatedContracts } from "./contract-records";

interface ContractPageSourceRow {
  sourceKind?: "normalized" | "legacy-json";
  agreementId?: number | null;
  contractIndex?: number | null;
  contractJson?: string | null;
  employeeId: string;
  employeeName: string;
  employmentId: number;
}

function employmentActiveOnBusinessDateSql(businessDate: string) {
  return Prisma.sql`(
    CASE
      WHEN NULLIF(BTRIM(e."joinDate"), '') IS NULL THEN TRUE
      WHEN BTRIM(e."joinDate") ~ '^\\d{4}-\\d{2}-\\d{2}$'
        AND pg_input_is_valid(BTRIM(e."joinDate"), 'date')
        THEN BTRIM(e."joinDate")::date <= ${businessDate}::date
      ELSE FALSE
    END
    AND CASE
      WHEN NULLIF(BTRIM(e."leaveDate"), '') IS NULL THEN TRUE
      WHEN BTRIM(e."leaveDate") ~ '^\\d{4}-\\d{2}-\\d{2}$'
        AND pg_input_is_valid(BTRIM(e."leaveDate"), 'date')
        THEN BTRIM(e."leaveDate")::date <= ${LATEST_INCLUSIVE_BUSINESS_DATE}::date
          AND BTRIM(e."leaveDate")::date >= ${businessDate}::date
      ELSE FALSE
    END
    AND (
      NULLIF(BTRIM(e."joinDate"), '') IS NOT NULL
      OR NULLIF(BTRIM(e."leaveDate"), '') IS NOT NULL
      OR e."isActive" = TRUE
    )
  )`;
}

function contractSourceSql(isActive: boolean | undefined, businessDate: string) {
  const activePredicate = employmentActiveOnBusinessDateSql(businessDate);
  const activeFilter = isActive === undefined
    ? Prisma.empty
    : isActive
      ? Prisma.sql`AND ${activePredicate}`
      : Prisma.sql`AND NOT ${activePredicate}`;

  return Prisma.sql`
    WITH valid_employments AS (
      SELECT
        e."id",
        e."employeeId",
        CASE
          WHEN e."contracts" IS NOT NULL AND pg_input_is_valid(e."contracts", 'jsonb')
            THEN e."contracts"::jsonb
          ELSE NULL
        END AS "contractsJson"
      FROM "Employment" e
      WHERE TRUE ${activeFilter}
    ), normalized_rows AS (
      SELECT
        'normalized'::text AS "sourceKind",
        agreement."id" AS "agreementId",
        employment."id" AS "employmentId",
        NULL::bigint AS "contractIndex",
        NULL::text AS "contractJson"
      FROM "EmploymentAgreement" agreement
      JOIN valid_employments employment ON employment."id" = agreement."employmentId"
      WHERE agreement."recordState" <> 'voided'
    ), legacy_rows AS (
      SELECT
        'legacy-json'::text AS "sourceKind",
        NULL::integer AS "agreementId",
        e."id" AS "employmentId",
        contract."ordinality" - 1 AS "contractIndex",
        contract."value" AS "contractJson"
      FROM valid_employments e
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE jsonb_typeof(e."contractsJson")
          WHEN 'array' THEN e."contractsJson"
          WHEN 'object' THEN jsonb_build_array(e."contractsJson")
          ELSE '[]'::jsonb
        END
      ) WITH ORDINALITY AS contract("value", "ordinality")
      WHERE e."contractsJson" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "EmploymentAgreement" baseline
          WHERE baseline."employmentId" = e."id"
            AND baseline."sourceKind" = 'legacy-baseline'
        )
    ), contract_rows AS (
      SELECT * FROM normalized_rows
      UNION ALL
      SELECT * FROM legacy_rows
    )
  `;
}

async function getDefaultContractPage(options: {
  businessDate: string;
  isActive?: boolean;
  page: number;
  pageSize: number;
}): Promise<PaginatedContracts> {
  const sourceSql = contractSourceSql(options.isActive, options.businessDate);
  const offset = (options.page - 1) * options.pageSize;
  const [totals, pageRows] = await Promise.all([
    prisma.$queryRaw<Array<{ total: number }>>(Prisma.sql`
      ${sourceSql}
      SELECT COUNT(*)::int AS "total" FROM contract_rows
    `),
    prisma.$queryRaw<ContractPageSourceRow[]>(Prisma.sql`
      ${sourceSql}
      SELECT
        contract_rows."employmentId",
        contract_rows."sourceKind",
        contract_rows."agreementId",
        contract_rows."contractIndex"::int AS "contractIndex",
        contract_rows."contractJson"::text AS "contractJson",
        employee."employeeId",
        employee."name" AS "employeeName"
      FROM contract_rows
      JOIN "Employment" employment ON employment."id" = contract_rows."employmentId"
      JOIN "Employee" employee ON employee."id" = employment."employeeId"
      ORDER BY contract_rows."employmentId" ASC, contract_rows."sourceKind" ASC, contract_rows."contractIndex" ASC, contract_rows."agreementId" ASC
      OFFSET ${offset}
      LIMIT ${options.pageSize}
    `),
  ]);
  const normalizedIds = pageRows.flatMap((row) => row.sourceKind === "normalized" && row.agreementId ? [row.agreementId] : []);
  const normalizedRows = await loadNormalizedEmploymentAgreementRowsByIds(normalizedIds, options.businessDate);
  let normalizedIndex = 0;
  const contracts = pageRows.flatMap((row) => row.sourceKind === "normalized"
    ? normalizedRows[normalizedIndex++] ? [normalizedRows[normalizedIndex - 1]] : []
    : buildLegacyAgreementRows([{
    id: row.employmentId,
    contracts: row.contractJson ?? null,
    employee: { employeeId: row.employeeId, name: row.employeeName },
  }], options.businessDate));
  return { contracts, total: totals[0]?.total ?? 0 };
}

export async function getContracts(options: {
  company?: string;
  department?: string;
  isActive?: string | null;
  keyword?: string;
  position?: string;
  page: number;
  pageSize: number;
}): Promise<PaginatedContracts> {
  const businessDate = workspaceBusinessDate(new Date());
  const hasComplexFilter = Boolean(options.keyword || options.company || options.department || options.position);
  if (!hasComplexFilter) {
    return getDefaultContractPage({
      businessDate,
      isActive: options.isActive === "true" ? true : options.isActive === "false" ? false : undefined,
      page: options.page,
      pageSize: options.pageSize,
    });
  }

  const employments = await prisma.employment.findMany({
    where: {},
    include: {
      employee: {
        select: {
          id: true,
          employeeId: true,
          name: true,
          positions: { include: employeePositionFilterInclude },
        },
      },
    },
    orderBy: { id: "asc" },
  });
  const scoped = employments.filter((employment) => {
    if (options.isActive !== "true" && options.isActive !== "false") return true;
    return (employmentTemporalPosition(employment, businessDate) === "current") === (options.isActive === "true");
  });
  const positionByEmploymentId = new Map(scoped.map((employment) => [employment.id, employment.employee?.positions ?? []]));
  const normalizedRows = await listAllNormalizedEmploymentAgreementRows(businessDate);
  const baselineEmploymentIds = new Set(normalizedRows
    .filter((row) => row.migrationState === "baseline" || row.migrationState === "baseline-incomplete")
    .map((row) => row.employmentId));
  let rows = [
    ...normalizedRows,
    ...buildLegacyAgreementRows(scoped.filter((employment) => !baselineEmploymentIds.has(employment.id)).map((employment) => ({
    id: employment.id,
    contracts: employment.contracts,
    employee: employment.employee,
    })), businessDate),
  ];
  const scopedEmploymentIds = new Set(scoped.map((employment) => employment.id));
  rows = rows.filter((row) => scopedEmploymentIds.has(row.employmentId));
  if (options.keyword) rows = filterContracts(rows, options.keyword);
  if (options.company) rows = rows.filter((row) => row.company === options.company);
  if (options.department || options.position) {
    rows = rows.filter((row) => employeePositionMatches(positionByEmploymentId.get(row.employmentId) ?? [], {
      department: options.department,
      position: options.position,
    }));
  }
  return paginateContracts(rows, options.page, options.pageSize);
}
