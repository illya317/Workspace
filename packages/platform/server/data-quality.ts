import "server-only";

import {
  dataQualityEvaluationResponseSchema,
  type DataQualityCheckDefinition,
  type DataQualityEvaluationResponse,
  type DataQualityTrigger,
} from "@workspace/platform/data-quality-contract";
import { DATA_QUALITY_PROVIDER_REGISTRATIONS } from "@workspace/platform/data-quality-provider-registry";
import { callWorkspaceInternalJson } from "./internal-unit-rpc";
import { prisma } from "./prisma";

const PROVIDERS = DATA_QUALITY_PROVIDER_REGISTRATIONS;
const MAX_MUTATION_ATTEMPTS = 5;

export type DataQualityRunResult = {
  runId: number;
  trigger: DataQualityTrigger;
  status: "succeeded" | "partial" | "failed";
  checkCount: number;
  openFindingCount: number;
  newFindingCount: number;
  resolvedFindingCount: number;
};

function providerHealthCheck(providerKey: string): DataQualityCheckDefinition {
  return {
    key: `platform.data-quality.provider.${providerKey}.available`,
    domain: "platform",
    title: `${providerKey.toUpperCase()} 业务资料巡检服务可用`,
    description: "Platform 必须能够通过签名内部接口调用领域规则 Provider。",
    defaultSeverity: "critical",
    triggerModes: ["manual", "scheduled", "mutation"],
  };
}

function providerHealthResponse(
  providerKey: string,
  failure: string | null,
): DataQualityEvaluationResponse {
  const check = providerHealthCheck(providerKey);
  return {
    schemaVersion: 1,
    providerKey: "platform",
    evaluatedAt: new Date().toISOString(),
    checks: [check],
    findings: failure ? [{
      fingerprint: `${check.key}:global`,
      checkKey: check.key,
      domain: check.domain,
      severity: check.defaultSeverity,
      title: check.title,
      summary: `${providerKey.toUpperCase()} 规则服务调用失败：${failure}`,
      count: 1,
      resourceKey: "settings.admin",
      samples: [],
    }] : [],
  };
}

async function persistEvaluation(runId: number, response: DataQualityEvaluationResponse) {
  const evaluatedAt = new Date(response.evaluatedAt);
  let newFindingCount = 0;
  let resolvedFindingCount = 0;

  for (const check of response.checks) {
    const checkFindings = response.findings.filter((finding) => finding.checkKey === check.key);
    await prisma.dataQualityCheckState.upsert({
      where: { checkKey: check.key },
      update: {
        providerKey: response.providerKey,
        domain: check.domain,
        title: check.title,
        description: check.description,
        defaultSeverity: check.defaultSeverity,
        triggerModesJson: JSON.stringify(check.triggerModes),
        lastStatus: checkFindings.length > 0 ? "issue" : "healthy",
        lastFindingCount: checkFindings.reduce((sum, finding) => sum + finding.count, 0),
        lastEvaluatedAt: evaluatedAt,
        lastRunId: runId,
      },
      create: {
        checkKey: check.key,
        providerKey: response.providerKey,
        domain: check.domain,
        title: check.title,
        description: check.description,
        defaultSeverity: check.defaultSeverity,
        triggerModesJson: JSON.stringify(check.triggerModes),
        lastStatus: checkFindings.length > 0 ? "issue" : "healthy",
        lastFindingCount: checkFindings.reduce((sum, finding) => sum + finding.count, 0),
        lastEvaluatedAt: evaluatedAt,
        lastRunId: runId,
      },
    });

    const activeFingerprints = checkFindings.map((finding) => finding.fingerprint);
    const resolved = await prisma.dataQualityFinding.updateMany({
      where: {
        checkKey: check.key,
        status: "open",
        ...(activeFingerprints.length > 0 ? { fingerprint: { notIn: activeFingerprints } } : {}),
      },
      data: { status: "resolved", resolvedAt: evaluatedAt },
    });
    resolvedFindingCount += resolved.count;

    for (const current of checkFindings) {
      const previous = await prisma.dataQualityFinding.findUnique({
        where: { fingerprint: current.fingerprint },
        select: {
          status: true,
        },
      });
      const reopened = previous?.status === "resolved";
      if (!previous || reopened) newFindingCount += 1;
      await prisma.dataQualityFinding.upsert({
        where: { fingerprint: current.fingerprint },
        update: {
          checkKey: current.checkKey,
          domain: current.domain,
          severity: current.severity,
          status: "open",
          title: current.title,
          summary: current.summary,
          count: current.count,
          resourceKey: current.resourceKey ?? null,
          href: current.href ?? null,
          samplesJson: JSON.stringify(current.samples),
          lastSeenAt: evaluatedAt,
          resolvedAt: null,
          lastRunId: runId,
        },
        create: {
          fingerprint: current.fingerprint,
          checkKey: current.checkKey,
          domain: current.domain,
          severity: current.severity,
          title: current.title,
          summary: current.summary,
          count: current.count,
          resourceKey: current.resourceKey ?? null,
          href: current.href ?? null,
          samplesJson: JSON.stringify(current.samples),
          firstSeenAt: evaluatedAt,
          lastSeenAt: evaluatedAt,
          lastRunId: runId,
        },
      });
    }
  }
  return { newFindingCount, resolvedFindingCount };
}

export async function runDataQuality(input: {
  trigger: DataQualityTrigger;
  requestedByUserId?: number | null;
  domains?: string[];
}): Promise<DataQualityRunResult> {
  const providers = PROVIDERS.filter((provider) => !input.domains?.length || input.domains.includes(provider.domain));
  if (providers.length === 0) throw new Error("没有可执行的业务资料巡检服务");
  const run = await prisma.dataQualityRun.create({
    data: {
      trigger: input.trigger,
      domainsJson: JSON.stringify(providers.map((provider) => provider.domain)),
      requestedByUserId: input.requestedByUserId ?? null,
    },
    select: { id: true },
  });
  let newFindingCount = 0;
  let resolvedFindingCount = 0;
  let successfulProviders = 0;
  const failures: string[] = [];
  const evaluatedCheckKeys = new Set<string>();

  for (const provider of providers) {
    try {
      const response = dataQualityEvaluationResponseSchema.parse(await callWorkspaceInternalJson({
        callerUnitId: "workspace-shell",
        path: `/api/modules/${provider.unitId}/internal/data-quality`,
        targetUnitId: provider.unitId,
        body: { trigger: input.trigger, requestedAt: new Date().toISOString() },
      }));
      if (response.providerKey !== provider.key) throw new Error("Provider identity mismatch");
      successfulProviders += 1;
      const persisted = await persistEvaluation(run.id, response);
      response.checks.forEach((check) => evaluatedCheckKeys.add(check.key));
      newFindingCount += persisted.newFindingCount;
      resolvedFindingCount += persisted.resolvedFindingCount;
      const health = await persistEvaluation(run.id, providerHealthResponse(provider.key, null));
      evaluatedCheckKeys.add(providerHealthCheck(provider.key).key);
      newFindingCount += health.newFindingCount;
      resolvedFindingCount += health.resolvedFindingCount;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${provider.key}: ${message}`);
      await prisma.dataQualityCheckState.updateMany({
        where: { providerKey: provider.key },
        data: { lastStatus: "error", lastEvaluatedAt: new Date(), lastRunId: run.id },
      });
      const health = await persistEvaluation(run.id, providerHealthResponse(provider.key, message));
      evaluatedCheckKeys.add(providerHealthCheck(provider.key).key);
      newFindingCount += health.newFindingCount;
      resolvedFindingCount += health.resolvedFindingCount;
    }
  }

  const status = successfulProviders === providers.length
    ? "succeeded" as const
    : successfulProviders === 0 ? "failed" as const : "partial" as const;
  const openFindingCount = await prisma.dataQualityFinding.count({ where: { status: "open" } });
  await prisma.dataQualityRun.update({
    where: { id: run.id },
    data: {
      status,
      finishedAt: new Date(),
      checkCount: evaluatedCheckKeys.size,
      openFindingCount,
      newFindingCount,
      resolvedFindingCount,
      failureMessage: failures.length > 0 ? failures.join("\n") : null,
    },
  });

  return {
    runId: run.id,
    trigger: input.trigger,
    status,
    checkCount: evaluatedCheckKeys.size,
    openFindingCount,
    newFindingCount,
    resolvedFindingCount,
  };
}

export async function runPendingDataQualityEvaluations() {
  const staleBefore = new Date(Date.now() - 10 * 60 * 1000);
  await prisma.dataQualityEvaluationRequest.updateMany({
    where: { status: "processing", processingAt: { lt: staleBefore }, attempts: { lt: MAX_MUTATION_ATTEMPTS } },
    data: { status: "pending", processingAt: null },
  });
  const pending = await prisma.dataQualityEvaluationRequest.findMany({
    where: { status: "pending", attempts: { lt: MAX_MUTATION_ATTEMPTS } },
    select: { id: true, domain: true },
    orderBy: { requestedAt: "asc" },
    take: 100,
  });
  if (pending.length === 0) return null;
  const ids = pending.map((request) => request.id);
  const claimed = await prisma.dataQualityEvaluationRequest.updateMany({
    where: { id: { in: ids }, status: "pending" },
    data: { status: "processing", processingAt: new Date(), attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return null;
  try {
    const result = await runDataQuality({
      trigger: "mutation",
      domains: [...new Set(pending.map((request) => request.domain))],
    });
    if (result.status === "failed") throw new Error("业务资料巡检服务全部不可用");
    await prisma.dataQualityEvaluationRequest.updateMany({
      where: { id: { in: ids }, status: "processing" },
      data: { status: "processed", processedAt: new Date(), processedByRunId: result.runId, lastError: null },
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const rows = await prisma.dataQualityEvaluationRequest.findMany({
      where: { id: { in: ids }, status: "processing" },
      select: { id: true, attempts: true },
    });
    await Promise.all(rows.map((row) => prisma.dataQualityEvaluationRequest.update({
      where: { id: row.id },
      data: {
        status: row.attempts >= MAX_MUTATION_ATTEMPTS ? "failed" : "pending",
        processingAt: null,
        lastError: message,
      },
    })));
    throw error;
  }
}
