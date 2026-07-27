import "dotenv/config";

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";
import {
  businessDateWindowsOverlap,
  classifyBusinessDateWindow,
  inclusiveBusinessPeriodToWindow,
  parseBusinessDate,
  type BusinessDateWindow,
} from "@workspace/platform/contracts/business-temporal";

export type EmploymentPreflightRow = {
  id: number;
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  isActive: boolean;
  joinDate: string | null;
  leaveDate: string | null;
};

export type EdpPreflightRow = {
  id: number;
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  reportingCompanyId: number | null;
  departmentId: number | null;
  positionId: number | null;
  isPrimary: boolean;
  startDate: string | null;
  endDate: string | null;
  allocationWeight: string | null;
};

export type EmployeeProjectPreflightRow = {
  id: number;
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  projectId: number;
  membershipUid: string;
  sequence: number;
  recordState: string;
  startDate: string | null;
  endDate: string | null;
};

export type HrTemporalPreflightFinding = {
  code: string;
  entity: "Employment" | "EDP" | "EmployeeProject";
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  recordIds: number[];
  summary: string;
};

export type HrTemporalPreflightResult = {
  ok: boolean;
  asOfDate: string;
  scanned: { employees: number; employments: number; edps: number; projectMemberships: number };
  findings: HrTemporalPreflightFinding[];
};

type Period = {
  start: string | null;
  end: string | null;
  window: BusinessDateWindow | null;
};

function normalizedBound(value: string | null) {
  const normalized = value?.trim() ?? "";
  if (!normalized) return { value: null, valid: true } as const;
  const parsed = parseBusinessDate(normalized);
  return parsed
    ? { value: parsed, valid: true } as const
    : { value: null, valid: false } as const;
}

function periodFromBounds(
  start: ReturnType<typeof normalizedBound>,
  end: ReturnType<typeof normalizedBound>,
): Period {
  const window = start.valid && end.valid
    ? inclusiveBusinessPeriodToWindow({ validFrom: start.value, validThrough: end.value })
    : null;
  return { start: start.value, end: end.value, window };
}

function periodContains(period: Period, date: string) {
  return period.window !== null
    && classifyBusinessDateWindow(period.window, date) === "current";
}

function periodsOverlap(left: Period, right: Period) {
  if (!left.window || !right.window) return false;
  return businessDateWindowsOverlap(left.window, right.window);
}

function parseAllocationWeight(value: string | null) {
  if (value === null || value.trim() === "") return null;
  const number = Number(value.trim());
  return Number.isFinite(number) && number > 0 ? number : null;
}

function byEmployee<T extends { employeeId: number }>(rows: readonly T[]) {
  const grouped = new Map<number, T[]>();
  for (const row of rows) {
    const group = grouped.get(row.employeeId) ?? [];
    group.push(row);
    grouped.set(row.employeeId, group);
  }
  return grouped;
}

function finding(
  row: EmploymentPreflightRow | EdpPreflightRow | EmployeeProjectPreflightRow,
  code: string,
  entity: "Employment" | "EDP" | "EmployeeProject",
  recordIds: number[],
  summary: string,
): HrTemporalPreflightFinding {
  return {
    code,
    entity,
    employeeId: row.employeeId,
    employeeCode: row.employeeCode,
    employeeName: row.employeeName,
    recordIds: [...recordIds].sort((a, b) => a - b),
    summary,
  };
}

function inspectEmploymentPeriods(
  rows: readonly EmploymentPreflightRow[],
  asOfDate: string,
  findings: HrTemporalPreflightFinding[],
) {
  const periods = new Map<number, Period>();
  for (const row of rows) {
    const start = normalizedBound(row.joinDate);
    const end = normalizedBound(row.leaveDate);
    if (!start.valid) {
      findings.push(finding(row, "employment.invalid_join_date", "Employment", [row.id], `joinDate 不是合法业务日期：${JSON.stringify(row.joinDate)}`));
    }
    if (!end.valid) {
      findings.push(finding(row, "employment.invalid_leave_date", "Employment", [row.id], `leaveDate 不是合法业务日期：${JSON.stringify(row.leaveDate)}`));
    }
    const period = periodFromBounds(start, end);
    if (start.valid && end.valid && !period.window) {
      if (start.value && end.value && start.value > end.value) {
        findings.push(finding(row, "employment.inverted_period", "Employment", [row.id], `入职日 ${start.value} 晚于离职日 ${end.value}`));
      } else {
        findings.push(finding(row, "employment.invalid_period", "Employment", [row.id], "包含式雇佣期间无法转换为规范半开区间；开放结束必须使用 null"));
      }
    }
    periods.set(row.id, period);
    if (period.window && (period.start || period.end)) {
      const derivedActive = periodContains(period, asOfDate);
      if (derivedActive !== row.isActive) {
        findings.push(finding(row, "employment.stale_is_active", "Employment", [row.id], `raw isActive=${row.isActive}，按 ${asOfDate} 的期间应为 ${derivedActive}`));
      }
    }
  }

  for (const employeeRows of byEmployee(rows).values()) {
    const dated = employeeRows.filter((row) => {
      const period = periods.get(row.id)!;
      return period.window && Boolean(period.start || period.end);
    });
    for (let leftIndex = 0; leftIndex < dated.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < dated.length; rightIndex += 1) {
        const left = dated[leftIndex]!;
        const right = dated[rightIndex]!;
        if (periodsOverlap(periods.get(left.id)!, periods.get(right.id)!)) {
          findings.push(finding(left, "employment.overlap", "Employment", [left.id, right.id], "雇佣期间按包含式首尾发生重叠"));
        }
      }
    }
    const hasUnknown = employeeRows.some((row) => !periods.get(row.id)!.window);
    if (!hasUnknown) {
      const current = employeeRows.filter((row) => {
        const period = periods.get(row.id)!;
        return period.start || period.end ? periodContains(period, asOfDate) : row.isActive;
      });
      if (current.length > 1) {
        findings.push(finding(current[0]!, "employment.current_multiple", "Employment", current.map((row) => row.id), `${asOfDate} 同时存在 ${current.length} 条当前雇佣记录`));
      }
    }
  }
  return periods;
}

function assignmentSlot(row: EdpPreflightRow) {
  if (row.positionId === null) return null;
  return `${row.reportingCompanyId ?? "null"}:${row.departmentId ?? "null"}:${row.positionId}`;
}

function inspectEdpRows(
  rows: readonly EdpPreflightRow[],
  findings: HrTemporalPreflightFinding[],
) {
  const periods = new Map<number, Period>();
  const allocationWeights = new Map<number, number | null>();
  for (const row of rows) {
    const start = normalizedBound(row.startDate);
    const end = normalizedBound(row.endDate);
    if (!start.valid) {
      findings.push(finding(row, "edp.invalid_start_date", "EDP", [row.id], `startDate 不是合法业务日期：${JSON.stringify(row.startDate)}`));
    }
    if (!end.valid) {
      findings.push(finding(row, "edp.invalid_end_date", "EDP", [row.id], `endDate 不是合法业务日期：${JSON.stringify(row.endDate)}`));
    }
    const period = periodFromBounds(start, end);
    if (start.valid && end.valid && !period.window) {
      if (start.value && end.value && start.value > end.value) {
        findings.push(finding(row, "edp.inverted_period", "EDP", [row.id], `任职开始日 ${start.value} 晚于结束日 ${end.value}`));
      } else {
        findings.push(finding(row, "edp.invalid_period", "EDP", [row.id], "包含式任职期间无法转换为规范半开区间；开放结束必须使用 null"));
      }
    }
    periods.set(row.id, period);
    const allocationWeight = parseAllocationWeight(row.allocationWeight);
    allocationWeights.set(row.id, allocationWeight);
    if (allocationWeight === null) {
      findings.push(finding(row, "edp.invalid_allocation_weight", "EDP", [row.id], `岗位投入权重缺失或不大于 0：${JSON.stringify(row.allocationWeight)}`));
    }
  }

  for (const employeeRows of byEmployee(rows).values()) {
    const bySlot = new Map<string, EdpPreflightRow[]>();
    for (const row of employeeRows) {
      const slot = assignmentSlot(row);
      if (!slot || !periods.get(row.id)!.window) continue;
      const slotRows = bySlot.get(slot) ?? [];
      slotRows.push(row);
      bySlot.set(slot, slotRows);
    }
    for (const slotRows of bySlot.values()) {
      for (let leftIndex = 0; leftIndex < slotRows.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < slotRows.length; rightIndex += 1) {
          const left = slotRows[leftIndex]!;
          const right = slotRows[rightIndex]!;
          if (periodsOverlap(periods.get(left.id)!, periods.get(right.id)!)) {
            findings.push(finding(left, "edp.slot_overlap", "EDP", [left.id, right.id], "同一公司、部门和岗位槽位的任职期间发生重叠"));
          }
        }
      }
    }
  }
  return { periods, allocationWeights };
}

function inspectProjectMembershipRows(
  rows: readonly EmployeeProjectPreflightRow[],
  findings: HrTemporalPreflightFinding[],
) {
  const periods = new Map<number, Period>();
  const confirmedByEmployeeProject = new Map<string, EmployeeProjectPreflightRow[]>();
  const sequenceKeys = new Set<string>();
  for (const row of rows) {
    if (!["confirmed", "cancelled", "superseded", "voided"].includes(row.recordState)) {
      findings.push(finding(row, "employee_project.invalid_record_state", "EmployeeProject", [row.id], `项目成员记录状态无效：${row.recordState}`));
    }
    const sequenceKey = `${row.membershipUid}:${row.sequence}`;
    if (sequenceKeys.has(sequenceKey)) {
      findings.push(finding(row, "employee_project.duplicate_sequence", "EmployeeProject", [row.id], `membership ${row.membershipUid} 的版本序号 ${row.sequence} 重复`));
    }
    sequenceKeys.add(sequenceKey);
    const start = normalizedBound(row.startDate);
    const end = normalizedBound(row.endDate);
    if (!start.valid) {
      findings.push(finding(row, "employee_project.invalid_start_date", "EmployeeProject", [row.id], `startDate 不是合法业务日期：${JSON.stringify(row.startDate)}`));
    }
    if (!end.valid) {
      findings.push(finding(row, "employee_project.invalid_end_date", "EmployeeProject", [row.id], `endDate 不是合法业务日期：${JSON.stringify(row.endDate)}`));
    }
    const period = periodFromBounds(start, end);
    if (start.valid && end.valid && !period.window) {
      if (start.value && end.value && start.value > end.value) {
        findings.push(finding(row, "employee_project.inverted_period", "EmployeeProject", [row.id], `项目成员开始日 ${start.value} 晚于结束日 ${end.value}`));
      } else {
        findings.push(finding(row, "employee_project.invalid_period", "EmployeeProject", [row.id], "包含式项目成员期间无法转换为规范半开区间；开放结束必须使用 null"));
      }
    }
    periods.set(row.id, period);
    if (row.recordState === "confirmed") {
      const key = `${row.employeeId}:${row.projectId}`;
      const group = confirmedByEmployeeProject.get(key) ?? [];
      group.push(row);
      confirmedByEmployeeProject.set(key, group);
    }
  }
  for (const group of confirmedByEmployeeProject.values()) {
    for (let leftIndex = 0; leftIndex < group.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < group.length; rightIndex += 1) {
        const left = group[leftIndex]!;
        const right = group[rightIndex]!;
        if (periodsOverlap(periods.get(left.id)!, periods.get(right.id)!)) {
          findings.push(finding(left, "employee_project.overlap", "EmployeeProject", [left.id, right.id], "同一员工和项目的已确认成员版本期间重叠"));
        }
      }
    }
  }
  return periods;
}

function currentEmploymentRows(
  rows: readonly EmploymentPreflightRow[],
  periods: ReadonlyMap<number, Period>,
  asOfDate: string,
) {
  return rows.filter((row) => {
    const period = periods.get(row.id)!;
    return period.start || period.end ? periodContains(period, asOfDate) : row.isActive;
  });
}

function inspectCurrentState(
  employments: readonly EmploymentPreflightRow[],
  employmentPeriods: ReadonlyMap<number, Period>,
  edps: readonly EdpPreflightRow[],
  edpState: ReturnType<typeof inspectEdpRows>,
  asOfDate: string,
  findings: HrTemporalPreflightFinding[],
) {
  const employmentGroups = byEmployee(employments);
  const edpGroups = byEmployee(edps);
  const employeeIds = new Set([...employmentGroups.keys(), ...edpGroups.keys()]);
  for (const employeeId of employeeIds) {
    const employmentRows = employmentGroups.get(employeeId) ?? [];
    const assignmentRows = edpGroups.get(employeeId) ?? [];
    if (employmentRows.some((row) => !employmentPeriods.get(row.id)!.window)) continue;
    const currentEmployments = currentEmploymentRows(employmentRows, employmentPeriods, asOfDate);
    if (assignmentRows.some((row) => !edpState.periods.get(row.id)!.window)) continue;
    const currentAssignments = assignmentRows.filter((row) => periodContains(edpState.periods.get(row.id)!, asOfDate));
    const identity = currentEmployments[0] ?? currentAssignments[0];
    if (!identity) continue;
    if (currentEmployments.length === 0 && currentAssignments.length > 0) {
      findings.push(finding(identity, "edp.current_without_employment", "EDP", currentAssignments.map((row) => row.id), `${asOfDate} 存在当前任职，但没有当前雇佣记录`));
      continue;
    }
    if (currentEmployments.length === 0) continue;
    if (currentAssignments.length === 0) {
      findings.push(finding(identity, "edp.current_missing", "EDP", [], `${asOfDate} 有当前雇佣记录，但没有当前任职`));
      continue;
    }
    const primaryCount = currentAssignments.filter((row) => row.isPrimary).length;
    if (primaryCount !== 1) {
      findings.push(finding(identity, "edp.current_primary_count", "EDP", currentAssignments.map((row) => row.id), `${asOfDate} 当前任职主岗数量为 ${primaryCount}，应为 1`));
    }
  }
}

function inspectCurrentProjectMemberships(
  projectMemberships: readonly EmployeeProjectPreflightRow[],
  projectMembershipPeriods: ReadonlyMap<number, Period>,
  employments: readonly EmploymentPreflightRow[],
  employmentPeriods: ReadonlyMap<number, Period>,
  asOfDate: string,
  findings: HrTemporalPreflightFinding[],
) {
  const employmentGroups = byEmployee(employments);
  for (const membershipRows of byEmployee(projectMemberships).values()) {
    if (membershipRows.some((row) => !projectMembershipPeriods.get(row.id)!.window)) continue;
    const currentMemberships = membershipRows.filter((row) => (
      row.recordState === "confirmed"
      && periodContains(projectMembershipPeriods.get(row.id)!, asOfDate)
    ));
    if (currentMemberships.length === 0) continue;
    const employmentRows = employmentGroups.get(currentMemberships[0]!.employeeId) ?? [];
    if (employmentRows.some((row) => !employmentPeriods.get(row.id)!.window)) continue;
    if (currentEmploymentRows(employmentRows, employmentPeriods, asOfDate).length === 0) {
      findings.push(finding(
        currentMemberships[0]!,
        "employee_project.current_without_employment",
        "EmployeeProject",
        currentMemberships.map((row) => row.id),
        `${asOfDate} 存在当前项目成员关系，但没有当前雇佣记录`,
      ));
    }
  }
}

export function analyzeHrBusinessTemporalRows(input: {
  asOfDate: string;
  employments: readonly EmploymentPreflightRow[];
  edps: readonly EdpPreflightRow[];
  projectMemberships: readonly EmployeeProjectPreflightRow[];
}): HrTemporalPreflightResult {
  if (!parseBusinessDate(input.asOfDate)) throw new Error(`--as-of must be a valid YYYY-MM-DD business date: ${input.asOfDate}`);
  const findings: HrTemporalPreflightFinding[] = [];
  const employmentPeriods = inspectEmploymentPeriods(input.employments, input.asOfDate, findings);
  const edpState = inspectEdpRows(input.edps, findings);
  const projectMembershipPeriods = inspectProjectMembershipRows(input.projectMemberships, findings);
  inspectCurrentState(input.employments, employmentPeriods, input.edps, edpState, input.asOfDate, findings);
  inspectCurrentProjectMemberships(
    input.projectMemberships,
    projectMembershipPeriods,
    input.employments,
    employmentPeriods,
    input.asOfDate,
    findings,
  );
  findings.sort((left, right) => left.code.localeCompare(right.code)
    || left.employeeCode.localeCompare(right.employeeCode)
    || (left.recordIds[0] ?? 0) - (right.recordIds[0] ?? 0));
  const employees = new Set([...input.employments, ...input.edps, ...input.projectMemberships].map((row) => row.employeeId));
  return {
    ok: findings.length === 0,
    asOfDate: input.asOfDate,
    scanned: {
      employees: employees.size,
      employments: input.employments.length,
      edps: input.edps.length,
      projectMemberships: input.projectMemberships.length,
    },
    findings,
  };
}

export function renderHrBusinessTemporalPreflight(result: HrTemporalPreflightResult) {
  const lines = [
    "HR Employment / EDP / EmployeeProject business-temporal preflight",
    `基准业务日：${result.asOfDate}`,
    `扫描：${result.scanned.employees} 名员工，${result.scanned.employments} 条 Employment，${result.scanned.edps} 条 EDP，${result.scanned.projectMemberships} 条 EmployeeProject`,
  ];
  if (result.ok) return `${lines.join("\n")}\n结果：通过，未发现可确定的数据问题。\n`;
  lines.push(`结果：失败，共 ${result.findings.length} 个问题。`);
  const grouped = new Map<string, HrTemporalPreflightFinding[]>();
  for (const item of result.findings) {
    const group = grouped.get(item.code) ?? [];
    group.push(item);
    grouped.set(item.code, group);
  }
  for (const [code, items] of grouped) {
    lines.push("", `[${code}] ${items.length}`);
    for (const item of items) {
      const records = item.recordIds.length > 0 ? `${item.entity} #${item.recordIds.join(", #")}` : item.entity;
      lines.push(`- ${item.employeeCode} ${item.employeeName}；${records}；${item.summary}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function databaseUrl() {
  const value = (process.env.DIRECT_URL || process.env.DATABASE_URL || "").trim();
  if (!/^postgres(?:ql)?:\/\//.test(value)) throw new Error("DIRECT_URL or DATABASE_URL must be a PostgreSQL URL");
  return value;
}

async function loadRowsReadOnly() {
  const client = new Client({ connectionString: databaseUrl(), application_name: "workspace-hr-temporal-preflight" });
  await client.connect();
  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const employments = await client.query<EmploymentPreflightRow>(`
      SELECT em."id", em."employeeId", e."employeeId" AS "employeeCode", e."name" AS "employeeName",
        em."isActive", em."joinDate", em."leaveDate"
      FROM "Employment" em
      JOIN "Employee" e ON e."id" = em."employeeId"
      ORDER BY em."employeeId", em."id"
    `);
    const edps = await client.query<EdpPreflightRow>(`
      SELECT ep."id", ep."employeeId", e."employeeId" AS "employeeCode", e."name" AS "employeeName",
        ep."reportingCompanyId", ep."departmentId", ep."positionId", ep."isPrimary",
        ep."startDate", ep."endDate", ep."allocationWeight"
      FROM "EmployeePosition" ep
      JOIN "Employee" e ON e."id" = ep."employeeId"
      ORDER BY ep."employeeId", ep."id"
    `);
    const projectMemberships = await client.query<EmployeeProjectPreflightRow>(`
      SELECT employee_project."id", employee_project."employeeId",
        employee."employeeId" AS "employeeCode", employee."name" AS "employeeName",
        employee_project."projectId", employee_project."membershipUid", employee_project."sequence",
        employee_project."recordState", employee_project."startDate", employee_project."endDate"
      FROM "EmployeeProject" employee_project
      JOIN "Employee" employee ON employee."id" = employee_project."employeeId"
      ORDER BY employee_project."employeeId", employee_project."id"
    `);
    await client.query("ROLLBACK");
    return { employments: employments.rows, edps: edps.rows, projectMemberships: projectMemberships.rows };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

function cliOptions(argv: string[]) {
  let asOfDate: string | undefined;
  let json = false;
  let help = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === "--json") json = true;
    else if (argument === "--help" || argument === "-h") help = true;
    else if (argument === "--as-of") asOfDate = argv[++index];
    else if (argument.startsWith("--as-of=")) asOfDate = argument.slice("--as-of=".length);
    else throw new Error(`unknown argument: ${argument}`);
  }
  return { asOfDate, json, help };
}

async function main() {
  const options = cliOptions(process.argv.slice(2));
  if (options.help) {
    process.stdout.write("Usage: node --conditions=react-server --import tsx scripts/check/hr-business-temporal-preflight.ts [--as-of YYYY-MM-DD] [--json]\n");
    return;
  }
  const asOfDate = options.asOfDate ?? (await import("@workspace/platform/server/business-date")).workspaceBusinessDate(new Date());
  const rows = await loadRowsReadOnly();
  const result = analyzeHrBusinessTemporalRows({ asOfDate, ...rows });
  process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : renderHrBusinessTemporalPreflight(result));
  if (!result.ok) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
