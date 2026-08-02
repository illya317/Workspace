import "server-only";

import type {
  DataQualityCheckDefinition,
  DataQualityEvaluationResponse,
  DataQualityFinding,
} from "@workspace/platform/data-quality-contract";
import { prisma } from "@workspace/platform/server/prisma";
import { currentEmploymentDateWhere, currentOpenEndedDateWhere } from "@workspace/platform/server/relation-registry";
import { isEmploymentPositionOptionalTitle } from "@workspace/hr/constants/employee-temporal-write-policy";
import { parseAllocationWeight } from "./field-validation";

const CHECKS = [
  {
    key: "hr.active-employment.unique",
    domain: "hr",
    title: "在职雇佣关系唯一",
    description: "同一员工同时只能存在一条在职雇佣关系。",
    defaultSeverity: "critical",
    triggerModes: ["manual", "scheduled", "mutation"],
  },
  {
    key: "hr.active-employee.current-assignment",
    domain: "hr",
    title: "在职员工当前任职完整",
    description: "除顾问、董事外，在职员工必须有当前任职，且当前任职中必须且只能有一个主岗。",
    defaultSeverity: "critical",
    triggerModes: ["manual", "scheduled", "mutation"],
  },
  {
    key: "hr.current-assignment.organization-complete",
    domain: "hr",
    title: "当前任职组织归属完整",
    description: "除顾问、董事外，当前任职必须落到任职公司、部门和岗位。",
    defaultSeverity: "warning",
    triggerModes: ["manual", "scheduled", "mutation"],
  },
  {
    key: "hr.current-assignment.allocation-weight",
    domain: "hr",
    title: "当前任职投入权重有效",
    description: "除顾问、董事外，同一在职员工的全部当前任职都要填写大于 0 的岗位投入权重。",
    defaultSeverity: "critical",
    triggerModes: ["manual", "scheduled", "mutation"],
  },
] as const satisfies readonly DataQualityCheckDefinition[];

type HrDataQualityRow = {
  id: number;
  employeeId: string;
  name: string;
  activeEmploymentCount: number;
  positionRequired: boolean;
  currentAssignments: Array<{
    reportingCompanyId: number | null;
    departmentId: number | null;
    departmentName: string | null;
    positionId: number | null;
    isPrimary: boolean;
    allocationWeight: string | null;
  }>;
};

function sample(rows: HrDataQualityRow[]) {
  return rows.slice(0, 8).map((row) => ({ key: row.employeeId, label: `${row.name}（${row.employeeId}）` }));
}

type DepartmentScope = { id: number; name: string };

function accountableDepartment(row: HrDataQualityRow): DepartmentScope | null {
  const assignments = row.currentAssignments.filter((assignment) => assignment.departmentId && assignment.departmentName);
  const primary = assignments.filter((assignment) => assignment.isPrimary);
  const candidates = primary.length === 1 ? primary : assignments;
  const departments = new Map(candidates.map((assignment) => [
    assignment.departmentId!,
    assignment.departmentName!,
  ]));
  if (departments.size !== 1) return null;
  const [id, name] = [...departments.entries()][0]!;
  return { id, name };
}

function findingsByDepartment(
  check: (typeof CHECKS)[number],
  rows: HrDataQualityRow[],
  issueSummary: (count: number) => string,
): DataQualityFinding[] {
  const groups = new Map<string, { department: DepartmentScope | null; rows: HrDataQualityRow[] }>();
  for (const row of rows) {
    const department = accountableDepartment(row);
    const key = department ? `department:${department.id}` : "global";
    const group = groups.get(key) ?? { department, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([scopeKey, group]) => ({
    fingerprint: `${check.key}:${scopeKey}`,
    checkKey: check.key,
    domain: check.domain,
    severity: check.defaultSeverity,
    title: check.title,
    summary: group.department
      ? `${group.department.name}：${issueSummary(group.rows.length)}`
      : `${issueSummary(group.rows.length)}，当前无法归属到唯一部门。`,
    count: group.rows.length,
    resourceKey: "hr.roster",
    departmentId: group.department?.id ?? null,
    href: "/hr/roster",
    samples: sample(group.rows),
  }));
}

function allocationWeightInvalid(row: HrDataQualityRow) {
  if (!row.positionRequired) return false;
  if (row.currentAssignments.length === 0) return false;
  const values = row.currentAssignments.map((assignment) => parseAllocationWeight(assignment.allocationWeight));
  return values.some((value) => value === null || Number.isNaN(value) || value <= 0);
}

export function evaluateHrDataQualityRows(rows: HrDataQualityRow[]): DataQualityFinding[] {
  const multipleActiveEmployment = rows.filter((row) => row.activeEmploymentCount > 1);
  const currentAssignmentInvalid = rows.filter((row) => (
    row.positionRequired
    && (
      row.currentAssignments.length === 0
      || row.currentAssignments.filter((assignment) => assignment.isPrimary).length !== 1
    )
  ));
  const organizationIncomplete = rows.filter((row) => (
    row.positionRequired
    && row.currentAssignments.some((assignment) => (
      assignment.reportingCompanyId === null
      || assignment.departmentId === null
      || assignment.positionId === null
    ))
  ));
  const invalidAllocationWeights = rows.filter(allocationWeightInvalid);
  return [
    ...findingsByDepartment(CHECKS[0], multipleActiveEmployment, (count) => `有 ${count} 名员工同时存在多条在职雇佣关系，需要确认唯一有效记录。`),
    ...findingsByDepartment(CHECKS[1], currentAssignmentInvalid, (count) => `有 ${count} 名在职员工缺少当前任职，或主岗数量不等于 1。`),
    ...findingsByDepartment(CHECKS[2], organizationIncomplete, (count) => `有 ${count} 名在职员工的当前任职缺少公司、部门或岗位。`),
    ...findingsByDepartment(CHECKS[3], invalidAllocationWeights, (count) => `有 ${count} 名在职员工的当前任职投入权重缺失或不大于 0。`),
  ];
}

export async function evaluateHrDataQuality(): Promise<DataQualityEvaluationResponse> {
  const employees = await prisma.employee.findMany({
    where: { employments: { some: currentEmploymentDateWhere() } },
    select: {
      id: true,
      employeeId: true,
      name: true,
      employments: { where: currentEmploymentDateWhere(), select: { id: true, title: true } },
      positions: {
        where: currentOpenEndedDateWhere(),
        select: {
          reportingCompanyId: true,
          departmentId: true,
          department: { select: { name: true } },
          positionId: true,
          isPrimary: true,
          allocationWeight: true,
        },
      },
    },
    orderBy: { id: "asc" },
  });
  const rows: HrDataQualityRow[] = employees.map((employee) => ({
    id: employee.id,
    employeeId: employee.employeeId,
    name: employee.name,
    activeEmploymentCount: employee.employments.length,
    positionRequired: !employee.employments.every((employment) => (
      isEmploymentPositionOptionalTitle(employment.title)
    )),
    currentAssignments: employee.positions.map((assignment) => ({
      ...assignment,
      departmentName: assignment.department?.name ?? null,
    })),
  }));
  return {
    schemaVersion: 1,
    providerKey: "hr",
    evaluatedAt: new Date().toISOString(),
    checks: [...CHECKS],
    findings: evaluateHrDataQualityRows(rows),
  };
}
