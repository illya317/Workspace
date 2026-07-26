import {
  classifyWorkReportCollectionStatus,
  evaluateWorkReportingPeriodPolicy,
  normalizeWorkReportingSettings,
  WORK_REPORTING_SETTINGS_CONFIG_KEY,
  type WorkReportCollectionStatus,
} from "@workspace/platform/work-reporting-policy";
import { prisma } from "@workspace/platform/server/prisma";
import type {
  HrPerformanceAudienceDepartment,
  HrPerformanceAudienceEmployee,
  HrPerformanceAudienceProject,
  HrPerformanceAudienceType,
} from "./performance-audience";

export type HrPerformanceReportCollectionEntry = {
  status: WorkReportCollectionStatus;
  deadline: string | null;
  submittedAt: string | null;
};

export type HrPerformanceReportCollectionSummary = {
  applicable: boolean;
  total: number;
  submittedOnTime: number;
  submittedLate: number;
  overdueMissing: number;
};

type ReportingCycle = {
  periodType: string;
  startDate: Date;
  endDate: Date;
};

type ReportingTarget = {
  audienceId: number;
  targetType: "personal" | "department" | "project";
  targetId: number | null;
};

export async function loadHrPerformanceReportCollection(input: {
  audienceType: HrPerformanceAudienceType;
  cycle: ReportingCycle | null;
  employees: HrPerformanceAudienceEmployee[];
  departments: HrPerformanceAudienceDepartment[];
  projects: HrPerformanceAudienceProject[];
  now?: Date;
}) {
  if (!input.cycle || (input.cycle.periodType !== "weekly" && input.cycle.periodType !== "monthly")) {
    return emptyCollection();
  }
  const targets = reportingTargets(input);
  const availableTargets = targets.filter((target): target is ReportingTarget & { targetId: number } => Boolean(target.targetId));
  const targetIds = targetIdsByType(availableTargets);
  const [config, reports] = await Promise.all([
    prisma.systemConfig.findUnique({
      where: { key: WORK_REPORTING_SETTINGS_CONFIG_KEY },
      select: { value: true },
    }),
    availableTargets.length ? prisma.workReport.findMany({
      where: {
        periodType: input.cycle.periodType,
        periodStart: input.cycle.startDate,
        reportStage: "final",
        OR: [
          ...(targetIds.personal.length ? [{ targetType: "personal", targetId: { in: targetIds.personal } }] : []),
          ...(targetIds.department.length ? [{ targetType: "department", targetId: { in: targetIds.department } }] : []),
          ...(targetIds.project.length ? [{ targetType: "project", targetId: { in: targetIds.project } }] : []),
        ],
      },
      select: { targetType: true, targetId: true, submittedAt: true, updatedAt: true },
    }) : Promise.resolve([]),
  ]);
  const settings = normalizeWorkReportingSettings(parseConfig(config?.value));
  const policy = evaluateWorkReportingPeriodPolicy(settings, {
    type: input.cycle.periodType,
    endDate: input.cycle.endDate,
  }, input.now);
  if (!policy) return emptyCollection();
  const reportByTarget = new Map(reports.map((report) => [
    targetKey(report.targetType, report.targetId),
    report,
  ]));
  const entries = new Map<number, HrPerformanceReportCollectionEntry>();
  for (const target of targets) {
    if (!target.targetId) {
      entries.set(target.audienceId, { status: "not_available", deadline: null, submittedAt: null });
      continue;
    }
    const report = reportByTarget.get(targetKey(target.targetType, target.targetId));
    const submittedAt = report?.submittedAt ?? report?.updatedAt ?? null;
    entries.set(target.audienceId, {
      status: classifyWorkReportCollectionStatus(policy, submittedAt),
      deadline: policy.deadline,
      submittedAt: submittedAt?.toISOString() ?? null,
    });
  }
  return {
    entries,
    summary: summarizeHrPerformanceReportCollection([...entries.values()]),
  };
}

export function summarizeHrPerformanceReportCollection(entries: HrPerformanceReportCollectionEntry[]): HrPerformanceReportCollectionSummary {
  const required = entries.filter((entry) => entry.status !== "not_enabled" && entry.status !== "not_available");
  return {
    applicable: true,
    total: required.length,
    submittedOnTime: required.filter((entry) => entry.status === "submitted_on_time").length,
    submittedLate: required.filter((entry) => entry.status === "submitted_late").length,
    overdueMissing: required.filter((entry) => entry.status === "overdue" || entry.status === "closed").length,
  };
}

function reportingTargets(input: {
  audienceType: HrPerformanceAudienceType;
  employees: HrPerformanceAudienceEmployee[];
  departments: HrPerformanceAudienceDepartment[];
  projects: HrPerformanceAudienceProject[];
}): ReportingTarget[] {
  if (input.audienceType === "department") {
    return input.departments.map((department) => ({ audienceId: department.id, targetType: "department", targetId: department.id }));
  }
  if (input.audienceType === "project") {
    return input.projects.map((project) => ({ audienceId: project.id, targetType: "project", targetId: project.id }));
  }
  return input.employees.map((employee) => ({ audienceId: employee.id, targetType: "personal", targetId: employee.userId ?? null }));
}

function targetIdsByType(targets: Array<ReportingTarget & { targetId: number }>) {
  return {
    personal: targets.filter((target) => target.targetType === "personal").map((target) => target.targetId),
    department: targets.filter((target) => target.targetType === "department").map((target) => target.targetId),
    project: targets.filter((target) => target.targetType === "project").map((target) => target.targetId),
  };
}

function targetKey(targetType: string, targetId: number) {
  return `${targetType}:${targetId}`;
}

function parseConfig(value: string | null | undefined) {
  if (!value) return {};
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return {};
  }
}

function emptyCollection() {
  return {
    entries: new Map<number, HrPerformanceReportCollectionEntry>(),
    summary: { applicable: false, total: 0, submittedOnTime: 0, submittedLate: 0, overdueMissing: 0 } satisfies HrPerformanceReportCollectionSummary,
  };
}
