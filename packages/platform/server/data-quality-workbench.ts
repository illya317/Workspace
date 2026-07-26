import "server-only";

import {
  getDataQualityChannelAvailability,
  getDataQualityPolicy,
} from "./data-quality-policy";
import { prisma } from "./prisma";

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
  const [policy, checks, findings, runs, deliveries, pendingMutationCount, openFindingCount, criticalFindingCount] = await Promise.all([
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
  ]);
  return {
    policy,
    channelAvailability: getDataQualityChannelAvailability(),
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
