import "server-only";

import type {
  DataQualityCheckDefinition,
  DataQualityEvaluationResponse,
  DataQualityFinding,
} from "@workspace/platform/data-quality-contract";
import { prisma } from "@workspace/platform/server/prisma";
import { currentEmploymentDateWhere, currentOpenEndedDateWhere } from "@workspace/platform/server/relation-registry";
import { parseWorkPercent } from "./field-validation";

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
    description: "在职员工必须有当前任职，且当前任职中必须且只能有一个主岗。",
    defaultSeverity: "critical",
    triggerModes: ["manual", "scheduled", "mutation"],
  },
  {
    key: "hr.current-assignment.organization-complete",
    domain: "hr",
    title: "当前任职组织归属完整",
    description: "当前任职必须落到任职公司、部门和岗位。",
    defaultSeverity: "warning",
    triggerModes: ["manual", "scheduled", "mutation"],
  },
  {
    key: "hr.current-assignment.workload-total",
    domain: "hr",
    title: "当前任职工作占比等于 1",
    description: "同一在职员工的全部当前任职都要填写工作占比，合计必须等于 1。",
    defaultSeverity: "critical",
    triggerModes: ["manual", "scheduled", "mutation"],
  },
] as const satisfies readonly DataQualityCheckDefinition[];

type HrDataQualityRow = {
  id: number;
  employeeId: string;
  name: string;
  activeEmploymentCount: number;
  currentAssignments: Array<{
    reportingCompanyId: number | null;
    departmentId: number | null;
    positionId: number | null;
    isPrimary: boolean;
    workPercent: string | null;
  }>;
};

function sample(rows: HrDataQualityRow[]) {
  return rows.slice(0, 8).map((row) => ({ key: row.employeeId, label: `${row.name}（${row.employeeId}）` }));
}

function finding(
  check: (typeof CHECKS)[number],
  rows: HrDataQualityRow[],
  summary: string,
): DataQualityFinding | null {
  if (rows.length === 0) return null;
  return {
    fingerprint: `${check.key}:global`,
    checkKey: check.key,
    domain: check.domain,
    severity: check.defaultSeverity,
    title: check.title,
    summary,
    count: rows.length,
    resourceKey: "hr.roster",
    href: "/hr/roster",
    samples: sample(rows),
  };
}

function workloadInvalid(row: HrDataQualityRow) {
  if (row.currentAssignments.length === 0) return false;
  const values = row.currentAssignments.map((assignment) => parseWorkPercent(assignment.workPercent));
  if (values.some((value) => value === null || Number.isNaN(value))) return true;
  const total = values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  return Math.abs(total - 1) > 0.0001;
}

export function evaluateHrDataQualityRows(rows: HrDataQualityRow[]): DataQualityFinding[] {
  const multipleActiveEmployment = rows.filter((row) => row.activeEmploymentCount > 1);
  const currentAssignmentInvalid = rows.filter((row) => (
    row.currentAssignments.length === 0
    || row.currentAssignments.filter((assignment) => assignment.isPrimary).length !== 1
  ));
  const organizationIncomplete = rows.filter((row) => row.currentAssignments.some((assignment) => (
    assignment.reportingCompanyId === null
    || assignment.departmentId === null
    || assignment.positionId === null
  )));
  const workloadTotalInvalid = rows.filter(workloadInvalid);
  return [
    finding(CHECKS[0], multipleActiveEmployment, `有 ${multipleActiveEmployment.length} 名员工同时存在多条在职雇佣关系，需要确认唯一有效记录。`),
    finding(CHECKS[1], currentAssignmentInvalid, `有 ${currentAssignmentInvalid.length} 名在职员工缺少当前任职，或主岗数量不等于 1。`),
    finding(CHECKS[2], organizationIncomplete, `有 ${organizationIncomplete.length} 名在职员工的当前任职缺少公司、部门或岗位。`),
    finding(CHECKS[3], workloadTotalInvalid, `有 ${workloadTotalInvalid.length} 名在职员工的当前任职工作占比缺失或合计不等于 1。`),
  ].filter((item): item is DataQualityFinding => item !== null);
}

export async function evaluateHrDataQuality(): Promise<DataQualityEvaluationResponse> {
  const employees = await prisma.employee.findMany({
    where: { employments: { some: currentEmploymentDateWhere() } },
    select: {
      id: true,
      employeeId: true,
      name: true,
      employments: { where: currentEmploymentDateWhere(), select: { id: true } },
      positions: {
        where: currentOpenEndedDateWhere(),
        select: {
          reportingCompanyId: true,
          departmentId: true,
          positionId: true,
          isPrimary: true,
          workPercent: true,
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
    currentAssignments: employee.positions,
  }));
  return {
    schemaVersion: 1,
    providerKey: "hr",
    evaluatedAt: new Date().toISOString(),
    checks: [...CHECKS],
    findings: evaluateHrDataQualityRows(rows),
  };
}
