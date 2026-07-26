import "server-only";

import {
  getDataQualityChannelAvailability,
  getDataQualityPolicy,
  listDataQualityRoutingResourceOptions,
} from "./data-quality-policy";
import { prisma } from "./prisma";
import { currentOpenEndedDateWhere } from "./relation-registry";

function parseJsonArray(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function getDataQualityWorkbench() {
  const [policy, checks, findings, runs, deliveries, pendingMutationCount, openFindingCount, criticalFindingCount, departments, users] = await Promise.all([
    getDataQualityPolicy(),
    prisma.dataQualityCheckState.findMany({ orderBy: [{ domain: "asc" }, { checkKey: "asc" }] }),
    prisma.dataQualityFinding.findMany({
      where: { status: "open" },
      orderBy: [{ severity: "asc" }, { lastSeenAt: "desc" }],
      take: 100,
    }),
    prisma.dataQualityRun.findMany({ orderBy: { startedAt: "desc" }, take: 12 }),
    prisma.dataQualityNotificationDelivery.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.dataQualityEvaluationRequest.count({ where: { status: { in: ["pending", "processing"] } } }),
    prisma.dataQualityFinding.count({ where: { status: "open" } }),
    prisma.dataQualityFinding.count({ where: { status: "open", severity: "critical" } }),
    prisma.department.findMany({
      where: { isArchived: false },
      select: { id: true, code: true, name: true },
      orderBy: [{ level: "asc" }, { code: "asc" }, { id: "asc" }],
    }),
    prisma.user.findMany({
      where: { canLogin: true },
      select: {
        username: true,
        employees: {
          select: {
            name: true,
            positions: {
              where: currentOpenEndedDateWhere({ isPrimary: true }),
              select: { position: { select: { name: true } } },
              orderBy: { id: "asc" },
              take: 1,
            },
          },
          orderBy: { id: "asc" },
          take: 1,
        },
      },
      orderBy: { username: "asc" },
    }),
  ]);
  const configuredRecipientUsernames = new Set([
    ...policy.notifications.workspace.fallbackRecipientUsernames,
    ...policy.notifications.workspace.routes.flatMap((route) => route.recipientUsernames),
  ]);
  return {
    policy,
    channelAvailability: getDataQualityChannelAvailability(),
    routingOptions: {
      resources: listDataQualityRoutingResourceOptions(),
      departments: departments.map((department) => ({
        value: String(department.id),
        label: department.name,
        subtitle: department.code,
      })),
      users: users.flatMap((user) => {
        const employee = user.employees[0];
        if (!employee) {
          return configuredRecipientUsernames.has(user.username)
            ? [{ value: user.username, label: `未绑定员工 · ${user.username}`, disabled: true }]
            : [];
        }
        const positionName = employee.positions[0]?.position?.name?.trim() || "未设置主岗位";
        return [{
          value: user.username,
          label: `${employee.name} · ${positionName}`,
          searchText: `${employee.name} ${positionName} ${user.username}`,
        }];
      }),
    },
    metrics: {
      checkCount: checks.length,
      healthyCheckCount: checks.filter((check) => check.lastStatus === "healthy").length,
      issueCheckCount: checks.filter((check) => check.lastStatus === "issue").length,
      errorCheckCount: checks.filter((check) => check.lastStatus === "error").length,
      openFindingCount,
      criticalFindingCount,
      pendingMutationCount,
    },
    checks: checks.map((check) => ({
      ...check,
      triggerModes: parseJsonArray(check.triggerModesJson),
      lastEvaluatedAt: check.lastEvaluatedAt?.toISOString() ?? null,
      updatedAt: check.updatedAt.toISOString(),
    })),
    findings: findings.map((finding) => ({
      ...finding,
      samples: parseJsonArray(finding.samplesJson),
      firstSeenAt: finding.firstSeenAt.toISOString(),
      lastSeenAt: finding.lastSeenAt.toISOString(),
      resolvedAt: finding.resolvedAt?.toISOString() ?? null,
      lastWorkspaceNotifiedAt: finding.lastWorkspaceNotifiedAt?.toISOString() ?? null,
      lastWecomNotifiedAt: finding.lastWecomNotifiedAt?.toISOString() ?? null,
    })),
    runs: runs.map((run) => ({
      ...run,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
    })),
    deliveries: deliveries.map((delivery) => ({
      ...delivery,
      sentAt: delivery.sentAt?.toISOString() ?? null,
      createdAt: delivery.createdAt.toISOString(),
    })),
  };
}
