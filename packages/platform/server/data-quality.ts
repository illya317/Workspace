import "server-only";

import {
  dataQualityEvaluationResponseSchema,
  type DataQualityCheckDefinition,
  type DataQualityEvaluationResponse,
  type DataQualityFinding,
  type DataQualityTrigger,
} from "@workspace/platform/data-quality-contract";
import {
  buildDataQualityNotificationGroups,
  type DataQualityNotificationGroup,
} from "../data-quality-notification-routing";
import { callWorkspaceInternalJson } from "./internal-unit-rpc";
import { sendNotification } from "./notifications";
import {
  dataQualitySeverityIncreased,
  dataQualitySeverityMeetsThreshold,
  getDataQualityPolicy,
  listDataQualityRoutingResourceOptions,
  type DataQualityPolicy,
} from "./data-quality-policy";
import { sendDataQualityWecomGroupAlert } from "./data-quality-wecom";
import { prisma } from "./prisma";

const PROVIDERS = [
  { key: "hr", domain: "hr", unitId: "hr" },
] as const;
const MAX_MUTATION_ATTEMPTS = 5;

type PreviousFinding = {
  status: string;
  severity: string;
  lastWorkspaceNotifiedAt: Date | null;
  lastWecomNotifiedAt: Date | null;
} | null;

type ObservedFinding = {
  finding: DataQualityFinding;
  previous: PreviousFinding;
  reopened: boolean;
};

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
    title: `${providerKey.toUpperCase()} 数据质量 Provider 可用`,
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
      href: "/settings/admin?tab=dataQuality",
      samples: [],
    }] : [],
  };
}

async function persistEvaluation(runId: number, response: DataQualityEvaluationResponse) {
  const evaluatedAt = new Date(response.evaluatedAt);
  const observed: ObservedFinding[] = [];
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
          severity: true,
          lastWorkspaceNotifiedAt: true,
          lastWecomNotifiedAt: true,
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
      observed.push({ finding: current, previous, reopened });
    }
  }
  return { observed, newFindingCount, resolvedFindingCount };
}

function notificationCandidates(
  observed: ObservedFinding[],
  policy: DataQualityPolicy,
  channel: "workspace" | "wecom",
  now: Date,
) {
  const repeatBefore = now.getTime() - policy.notifications.repeatAfterHours * 60 * 60 * 1000;
  return observed.filter(({ finding, previous, reopened }) => {
    if (!dataQualitySeverityMeetsThreshold(finding.severity, policy.notifications.minimumSeverity)) return false;
    if (!previous || reopened || dataQualitySeverityIncreased(previous.severity, finding.severity)) return true;
    const lastNotifiedAt = channel === "workspace"
      ? previous.lastWorkspaceNotifiedAt
      : previous.lastWecomNotifiedAt;
    return !lastNotifiedAt || lastNotifiedAt.getTime() <= repeatBefore;
  }).map(({ finding }) => finding);
}

type DeliveryGroup = DataQualityNotificationGroup & {
  resourceLabel: string;
  departmentName: string | null;
  href: string;
};

async function resolveDeliveryGroups(groups: DataQualityNotificationGroup[]): Promise<DeliveryGroup[]> {
  const departmentIds = [...new Set(groups.flatMap((group) => group.departmentId ? [group.departmentId] : []))];
  const departments = departmentIds.length > 0
    ? await prisma.department.findMany({
        where: { id: { in: departmentIds } },
        select: { id: true, name: true },
      })
    : [];
  const departmentNames = new Map(departments.map((department) => [department.id, department.name]));
  const resourceLabels = new Map(listDataQualityRoutingResourceOptions().map((option) => [option.value, option.label]));
  return groups.map((group) => ({
    ...group,
    resourceLabel: group.resourceKey
      ? resourceLabels.get(group.resourceKey) ?? group.resourceKey
      : "未归属 L2",
    departmentName: group.departmentId
      ? departmentNames.get(group.departmentId) ?? `部门 #${group.departmentId}`
      : null,
    href: group.findings.find((finding) => finding.href)?.href ?? "/settings/admin?tab=dataQuality",
  }));
}

function alertPayload(runId: number, trigger: DataQualityTrigger, group: DeliveryGroup) {
  const findings = group.findings;
  return {
    runId,
    trigger,
    checkedAt: new Date().toISOString(),
    findingCount: findings.length,
    criticalCount: findings.filter((finding) => finding.severity === "critical").length,
    warningCount: findings.filter((finding) => finding.severity === "warning").length,
    scope: {
      resourceKey: group.resourceKey,
      resourceLabel: group.resourceLabel,
      departmentId: group.departmentId,
      departmentName: group.departmentName,
    },
    href: group.href,
    findings: findings.map((finding) => ({
      fingerprint: finding.fingerprint,
      severity: finding.severity,
      title: finding.title,
      summary: finding.summary,
      count: finding.count,
    })),
  };
}

async function deliverWorkspaceAlerts(
  runId: number,
  trigger: DataQualityTrigger,
  policy: DataQualityPolicy,
  findings: DataQualityFinding[],
) {
  if (!policy.notifications.workspace.enabled || findings.length === 0) return;
  const groups = await resolveDeliveryGroups(buildDataQualityNotificationGroups({
    findings,
    routes: policy.notifications.workspace.routes,
    fallbackRecipientUsernames: policy.notifications.workspace.fallbackRecipientUsernames,
  }));
  const allUsernames = [...new Set(groups.flatMap((group) => group.recipientUsernames))];
  const users = await prisma.user.findMany({
    where: { username: { in: allUsernames }, canLogin: true },
    select: { id: true, username: true },
  });
  const usersByUsername = new Map(users.map((user) => [user.username, user]));
  for (const group of groups) {
    const scope = [group.resourceLabel, group.departmentName].filter(Boolean).join(" · ");
    const destination = `${scope} → ${group.recipientUsernames.join(",")}`;
    try {
      const recipients = group.recipientUsernames.map((username) => usersByUsername.get(username)).filter(Boolean);
      if (recipients.length !== group.recipientUsernames.length) throw new Error("分流规则包含不存在或不可登录的站内接收人");
      const payload = alertPayload(runId, trigger, group);
      await Promise.all(recipients.map((recipient) => sendNotification({
        recipientUserId: recipient!.id,
        type: "platform.dataQuality.alert",
        payload,
        isImportant: payload.criticalCount > 0,
        isStrongReminder: payload.criticalCount > 0,
        requiresAcknowledgement: payload.criticalCount > 0,
      })));
      const sentAt = new Date();
      await prisma.$transaction([
        prisma.dataQualityFinding.updateMany({
          where: { fingerprint: { in: group.findings.map((finding) => finding.fingerprint) } },
          data: { lastWorkspaceNotifiedAt: sentAt },
        }),
        prisma.dataQualityNotificationDelivery.create({
          data: { runId, channel: "workspace", destination, status: "sent", findingCount: group.findings.length, sentAt },
        }),
      ]);
    } catch (error) {
      await prisma.dataQualityNotificationDelivery.create({
        data: {
          runId,
          channel: "workspace",
          destination,
          status: "failed",
          findingCount: group.findings.length,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}

async function deliverWecomAlerts(
  runId: number,
  trigger: DataQualityTrigger,
  policy: DataQualityPolicy,
  findings: DataQualityFinding[],
) {
  if (!policy.notifications.wecomGroup.enabled || findings.length === 0) return;
  const groups = await resolveDeliveryGroups(buildDataQualityNotificationGroups({ findings }));
  for (const group of groups) {
    const scope = [group.resourceLabel, group.departmentName].filter(Boolean).join(" · ");
    const destination = `${scope} → configured-group-webhook`;
    try {
      await sendDataQualityWecomGroupAlert({
        runId,
        trigger,
        findings: group.findings,
        scope: { resourceLabel: group.resourceLabel, departmentName: group.departmentName, href: group.href },
      });
      const sentAt = new Date();
      await prisma.$transaction([
        prisma.dataQualityFinding.updateMany({
          where: { fingerprint: { in: group.findings.map((finding) => finding.fingerprint) } },
          data: { lastWecomNotifiedAt: sentAt },
        }),
        prisma.dataQualityNotificationDelivery.create({
          data: { runId, channel: "wecom_group", destination, status: "sent", findingCount: group.findings.length, sentAt },
        }),
      ]);
    } catch (error) {
      await prisma.dataQualityNotificationDelivery.create({
        data: {
          runId,
          channel: "wecom_group",
          destination,
          status: "failed",
          findingCount: group.findings.length,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}

export async function runDataQuality(input: {
  trigger: DataQualityTrigger;
  requestedByUserId?: number | null;
  domains?: string[];
}): Promise<DataQualityRunResult> {
  const providers = PROVIDERS.filter((provider) => !input.domains?.length || input.domains.includes(provider.domain));
  if (providers.length === 0) throw new Error("没有可执行的数据质量 Provider");
  const run = await prisma.dataQualityRun.create({
    data: {
      trigger: input.trigger,
      domainsJson: JSON.stringify(providers.map((provider) => provider.domain)),
      requestedByUserId: input.requestedByUserId ?? null,
    },
    select: { id: true },
  });
  const observed: ObservedFinding[] = [];
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
      observed.push(...persisted.observed);
      newFindingCount += persisted.newFindingCount;
      resolvedFindingCount += persisted.resolvedFindingCount;
      const health = await persistEvaluation(run.id, providerHealthResponse(provider.key, null));
      evaluatedCheckKeys.add(providerHealthCheck(provider.key).key);
      observed.push(...health.observed);
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
      observed.push(...health.observed);
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

  const policy = await getDataQualityPolicy();
  const now = new Date();
  const workspaceFindings = notificationCandidates(observed, policy, "workspace", now);
  const wecomFindings = notificationCandidates(observed, policy, "wecom", now);
  await Promise.all([
    deliverWorkspaceAlerts(run.id, input.trigger, policy, workspaceFindings),
    deliverWecomAlerts(run.id, input.trigger, policy, wecomFindings),
  ]);
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
    if (result.status === "failed") throw new Error("领域数据质量 Provider 全部不可用");
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
