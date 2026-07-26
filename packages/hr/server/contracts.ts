import { prisma } from "@workspace/platform/server/prisma";
import { Prisma } from "@workspace/platform/server/prisma";
import { checkHRUpdate } from "@workspace/platform/server/auth";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { mapValidationToServiceResult } from "@workspace/platform/server/domain-validation";
import { ensureEditHistoryBaseline, snapshotHistory } from "@workspace/platform/server/history";
import {
  buildContractRows,
  clearPrimaryContractFlags,
  filterContracts,
  normalizeContractRecord,
  paginateContracts,
  parseContracts,
  type PaginatedContracts,
} from "./contract-records";
import {
  buildContractCreateCommand,
  buildContractDeleteCommand,
  buildContractPageDraftCommand,
} from "./domain/contract-validation";
import { employeePositionFilterInclude, employeePositionMatches } from "./employee-position-filters";
export {
  buildContractRows,
  clearPrimaryContractFlags,
  filterContracts,
  normalizeContractRecord,
  paginateContracts,
  parseContracts,
};
export type { ContractRow, PaginatedContracts } from "./contract-records";

interface ContractPageSourceRow {
  contractIndex: number;
  contractJson: string;
  employeeId: string;
  employeeName: string;
  employmentId: number;
}

function contractSourceSql(isActive?: boolean) {
  const activeFilter = isActive === undefined
    ? Prisma.empty
    : Prisma.sql`AND e."isActive" = ${isActive}`;

  return Prisma.sql`
    WITH valid_employments AS (
      SELECT
        e."id",
        e."employeeId",
        e."contracts"::jsonb AS "contractsJson"
      FROM "Employment" e
      WHERE e."contracts" IS NOT NULL
        AND pg_input_is_valid(e."contracts", 'jsonb')
        ${activeFilter}
    ), contract_rows AS (
      SELECT
        e."id" AS "employmentId",
        e."employeeId",
        contract."value" AS "contractJson",
        contract."ordinality" - 1 AS "contractIndex"
      FROM valid_employments e
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE jsonb_typeof(e."contractsJson")
          WHEN 'array' THEN e."contractsJson"
          WHEN 'object' THEN jsonb_build_array(e."contractsJson")
          ELSE '[]'::jsonb
        END
      ) WITH ORDINALITY AS contract("value", "ordinality")
    )
  `;
}

async function getDefaultContractPage(options: {
  isActive?: boolean;
  page: number;
  pageSize: number;
}): Promise<PaginatedContracts> {
  const sourceSql = contractSourceSql(options.isActive);
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
        contract_rows."contractIndex"::int AS "contractIndex",
        contract_rows."contractJson"::text AS "contractJson",
        employee."employeeId",
        employee."name" AS "employeeName"
      FROM contract_rows
      JOIN "Employee" employee ON employee."id" = contract_rows."employeeId"
      ORDER BY contract_rows."employmentId" ASC, contract_rows."contractIndex" ASC
      OFFSET ${offset}
      LIMIT ${options.pageSize}
    `),
  ]);

  const contracts = pageRows.flatMap((row) =>
    buildContractRows([{
      id: row.employmentId,
      contracts: row.contractJson,
      employee: { employeeId: row.employeeId, name: row.employeeName },
    }]).map((contract) => ({
      ...contract,
      id: row.employmentId * 1000 + row.contractIndex,
    })),
  );

  return { contracts, total: totals[0]?.total ?? 0 };
}

async function clearPrimaryContractsForEmployee(
  employeeId: number,
  editorId: number,
  exceptEmploymentId?: number,
) {
  const employments = await prisma.employment.findMany({
    where: { employeeId, id: exceptEmploymentId ? { not: exceptEmploymentId } : undefined },
    select: { id: true, contracts: true },
  });

  for (const employment of employments) {
    const parsed = parseContracts(employment.contracts).map(normalizeContractRecord);
    const result = clearPrimaryContractFlags(parsed);
    if (!result.changed) continue;
    await ensureEditHistoryBaseline("Employment", employment.id, editorId);
    await prisma.employment.update({
      where: { id: employment.id },
      data: {
        contracts: JSON.stringify(result.contracts),
        editedBy: editorId,
        editedAt: new Date(),
        version: { increment: 1 },
      },
    });
    await snapshotHistory("Employment", employment.id, editorId);
  }
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
  const hasComplexFilter = Boolean(
    options.keyword || options.company || options.department || options.position,
  );
  if (!hasComplexFilter) {
    return getDefaultContractPage({
      isActive: options.isActive === "true"
        ? true
        : options.isActive === "false"
          ? false
          : undefined,
      page: options.page,
      pageSize: options.pageSize,
    });
  }

  const where: Prisma.EmploymentWhereInput = {};
  if (options.isActive === "true") where.isActive = true;
  if (options.isActive === "false") where.isActive = false;

  const employments = await prisma.employment.findMany({
    where,
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
  const positionByEmploymentId = new Map(
    employments.map((employment) => [employment.id, employment.employee?.positions ?? []]),
  );

  let rows = buildContractRows(
    employments.map((e) => ({
      id: e.id,
      contracts: e.contracts,
      employee: e.employee,
    }))
  );

  if (options.keyword) {
    rows = filterContracts(rows, options.keyword);
  }
  if (options.company) {
    rows = rows.filter((row) => row.company === options.company);
  }
  if (options.department || options.position) {
    rows = rows.filter((row) =>
      employeePositionMatches(positionByEmploymentId.get(row.employmentId) ?? [], {
        department: options.department,
        position: options.position,
      }),
    );
  }

  return paginateContracts(rows, options.page, options.pageSize);
}

async function addContract(
  employeeId: unknown,
  contractData: Record<string, unknown>,
  editorId: number
) {
  const emp = await prisma.employment.findFirst({
    where: { employeeId: Number(employeeId) },
    orderBy: { id: "desc" },
  });

  if (!emp) {
    return { success: false, error: "该员工无雇佣记录", status: 404 };
  }

  const rawContracts = parseContracts(emp.contracts).map(normalizeContractRecord);
  if (contractData.isPrimary === true) {
    const result = clearPrimaryContractFlags(rawContracts);
    rawContracts.splice(0, rawContracts.length, ...result.contracts);
    await clearPrimaryContractsForEmployee(emp.employeeId, editorId, emp.id);
  }
  rawContracts.push(normalizeContractRecord(contractData));

  await ensureEditHistoryBaseline("Employment", emp.id, editorId);
  await prisma.employment.update({
    where: { id: emp.id },
    data: {
      contracts: JSON.stringify(rawContracts),
      editedBy: editorId,
      editedAt: new Date(),
      version: { increment: 1 },
    },
  });
  await snapshotHistory("Employment", emp.id, editorId);

  return { success: true };
}

export async function createEmployeeContract(input: {
  employeeId: unknown;
  contractData: Record<string, unknown>;
  editorId: number;
}) {
  const command = mapValidationToServiceResult(await buildContractCreateCommand(input.employeeId, input.contractData));
  if (!command.ok) return { success: false, error: command.error, status: command.status };
  return addContract(command.data.employeeId, command.data.contract, input.editorId);
}

function decodeSyntheticContractId(contractId: number) {
  return {
    employmentId: Math.floor(contractId / 1000),
    index: contractId % 1000,
  };
}

async function loadSyntheticContract(contractId: number) {
  const { employmentId, index } = decodeSyntheticContractId(contractId);
  const employment = await prisma.employment.findUnique({ where: { id: employmentId } });
  if (!employment || !employment.contracts) return { ok: false as const, error: "合同不存在", status: 404 };

  let contracts: Record<string, unknown>[];
  try {
    contracts = JSON.parse(employment.contracts) as Record<string, unknown>[];
  } catch {
    return { ok: false as const, error: "合同数据异常", status: 500 };
  }
  if (!Array.isArray(contracts) || index >= contracts.length) {
    return { ok: false as const, error: "合同不存在", status: 404 };
  }

  return { ok: true as const, employment, employmentId, index, contracts };
}

export async function updateContractPageDraft(input: {
  userId: number;
  changes: Array<{ id: number; field: string; value: unknown }>;
}) {
  const command = mapValidationToServiceResult(await buildContractPageDraftCommand(input));
  if (!command.ok) return command;
  if (!(await checkHRUpdate(command.data.userId, "hr.roster"))) return serviceError("无权限", 403);
  const direct = await assertBusinessActionDirectExecutionAllowed({
    businessActionKey: "hr.roster.employeeContract.update",
    actorUserId: command.data.userId,
    resourceKey: "hr.roster",
    scopeType: "global",
    scopeId: null,
    blockedMessage: "员工合同更新已配置为必须走流程，请从统一保存入口提交",
  });
  if (!direct.ok) return direct;

  const targetEmploymentIds = Array.from(new Set(command.data.changes.map((change) => decodeSyntheticContractId(change.id).employmentId)));
  const targets = await prisma.employment.findMany({
    where: { id: { in: targetEmploymentIds } },
    select: { id: true, employeeId: true, contracts: true },
  });
  if (targets.length !== targetEmploymentIds.length) return serviceError("部分合同不存在，请刷新后重试", 404);
  const employeeIds = Array.from(new Set(targets.map((row) => row.employeeId)));
  const employments = await prisma.employment.findMany({
    where: { employeeId: { in: employeeIds } },
    select: { id: true, employeeId: true, contracts: true },
  });
  const rows = new Map(employments.map((employment) => [employment.id, {
    ...employment,
    contracts: parseContracts(employment.contracts).map(normalizeContractRecord),
  }]));
  const changedEmploymentIds = new Set<number>();

  for (const change of command.data.changes) {
    const { employmentId, index } = decodeSyntheticContractId(change.id);
    const employment = rows.get(employmentId);
    if (!employment || !employment.contracts[index]) return serviceError("合同不存在，请刷新后重试", 404);
    if (change.field === "isPrimary" && change.value === true) {
      for (const row of rows.values()) {
        if (row.employeeId !== employment.employeeId) continue;
        const cleared = clearPrimaryContractFlags(row.contracts);
        if (cleared.changed) {
          row.contracts = cleared.contracts.map(normalizeContractRecord);
          changedEmploymentIds.add(row.id);
        }
      }
    }
    employment.contracts[index] = normalizeContractRecord({
      ...employment.contracts[index],
      [change.field]: change.value ?? null,
    });
    changedEmploymentIds.add(employmentId);
  }

  await prisma.$transaction(async (tx) => {
    for (const employmentId of changedEmploymentIds) {
      const employment = rows.get(employmentId)!;
      await ensureEditHistoryBaseline("Employment", employmentId, command.data.userId, tx);
      await tx.employment.update({
        where: { id: employmentId },
        data: {
          contracts: JSON.stringify(employment.contracts),
          editedBy: command.data.userId,
          editedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await snapshotHistory("Employment", employmentId, command.data.userId, tx);
    }
  });
  return serviceOk({
    success: true,
    updatedCount: changedEmploymentIds.size,
    changeCount: command.data.changes.length,
  });
}

export async function deleteContract(contractId: number, userId: number) {
  const command = mapValidationToServiceResult(buildContractDeleteCommand(contractId));
  if (!command.ok) return command;

  const loaded = await loadSyntheticContract(command.data.contractId);
  if (!loaded.ok) return serviceError(loaded.error, loaded.status);

  loaded.contracts.splice(loaded.index, 1);
  await ensureEditHistoryBaseline("Employment", loaded.employmentId, userId);
  await prisma.employment.update({
    where: { id: loaded.employmentId },
    data: { contracts: JSON.stringify(loaded.contracts), editedBy: userId, editedAt: new Date(), version: { increment: 1 } },
  });
  await snapshotHistory("Employment", loaded.employmentId, userId);

  return serviceOk({ success: true });
}
