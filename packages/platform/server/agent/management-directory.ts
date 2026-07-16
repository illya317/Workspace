import "server-only";

import type {
  AgentManagementPeriod,
  AgentManagementRuntimeKind,
  AgentReportProfileItem,
  AgentReportsData,
  AgentReportStatus,
  AgentUsageData,
} from "@workspace/platform/types";

import { prisma } from "../prisma";
import {
  deriveAgentReportStatus,
  mergeAgentSessionReportStatus,
} from "./management-status";
import { loadSessionProposalStates } from "./management-proposal-state";
import { reconcileStaleAgentProposalExecutions } from "./proposal-execution-lease";
import { reconcileStaleAgentRuns } from "./run-audit";

export { getAgentConfigurationData } from "./configuration-directory";

const ANALYSIS_WINDOW_DAYS = 30;
const MAX_DETAIL_SESSIONS = 100;

const TOKEN_FIELDS = [
  "inputOtherTokens",
  "inputCacheReadTokens",
  "inputCacheCreationTokens",
  "outputTokens",
] as const;

type TokenValues = Record<(typeof TOKEN_FIELDS)[number], number | null | undefined>;

function analysisPeriod(now = new Date()): { fromDate: Date; period: AgentManagementPeriod } {
  const fromDate = new Date(now.getTime() - ANALYSIS_WINDOW_DAYS * 24 * 60 * 60 * 1_000);
  return {
    fromDate,
    period: {
      from: fromDate.toISOString(),
      to: now.toISOString(),
      label: `最近 ${ANALYSIS_WINDOW_DAYS} 天`,
    },
  };
}

function numberOrZero(value: number | null | undefined) {
  return value ?? 0;
}

function hasTokenUsage(values: TokenValues) {
  return TOKEN_FIELDS.some((key) => values[key] != null);
}

function totalTokens(values: TokenValues): number | null {
  if (!hasTokenUsage(values)) return null;
  return TOKEN_FIELDS.reduce((total, key) => total + numberOrZero(values[key]), 0);
}

function asRuntimeKind(value: string): AgentManagementRuntimeKind {
  if (value === "workspace" || value === "codex_local" || value === "ci" || value === "server_ops") {
    return value;
  }
  throw new Error(`Unsupported Agent runtime kind: ${value}`);
}

function statusCount(map: Map<string, number>, status: string) {
  return map.get(status) ?? 0;
}

async function loadRequesterDirectory(userIds: number[]) {
  if (userIds.length === 0) return new Map<number, {
    name: string;
    employeeId: string | null;
    departmentName: string | null;
  }>();
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      username: true,
      employeeId: true,
      employees: {
        orderBy: { id: "asc" },
        take: 1,
        select: {
          employeeId: true,
          name: true,
          positions: {
            orderBy: [{ isPrimary: "desc" }, { id: "desc" }],
            take: 1,
            select: { department: { select: { name: true } } },
          },
        },
      },
    },
  });
  return new Map(users.map((user) => {
    const employee = user.employees[0];
    return [user.id, {
      name: employee?.name || user.username,
      employeeId: employee?.employeeId ?? user.employeeId,
      departmentName: employee?.positions[0]?.department?.name ?? null,
    }];
  }));
}

export async function getAgentUsageData(options: { canAudit: boolean }): Promise<AgentUsageData> {
  const now = new Date();
  await Promise.all([
    reconcileStaleAgentRuns(now),
    reconcileStaleAgentProposalExecutions({ now }),
  ]);
  const { fromDate, period } = analysisPeriod(now);
  const where = { startedAt: { gte: fromDate, lte: now } } as const;
  const tokenCapturedWhere = {
    ...where,
    OR: TOKEN_FIELDS.map((field) => ({ [field]: { not: null } })),
  };

  const [
    aggregate,
    statusGroups,
    employeeGroups,
    employeeStatusGroups,
    employeeSessionPairs,
    capturedEmployeeGroups,
    sessionGroups,
    capturedSessionGroups,
    tokenGroups,
    capturedTokenGroups,
    profileRows,
  ] = await Promise.all([
    prisma.agentRun.aggregate({
      where,
      _count: { _all: true },
      _sum: {
        inputOtherTokens: true,
        inputCacheReadTokens: true,
        inputCacheCreationTokens: true,
        outputTokens: true,
      },
      _max: { contextUsagePeak: true },
    }),
    prisma.agentRun.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.agentRun.groupBy({
      by: ["requesterUserId"],
      where,
      _count: { _all: true },
      _sum: {
        inputOtherTokens: true,
        inputCacheReadTokens: true,
        inputCacheCreationTokens: true,
        outputTokens: true,
      },
      _max: { startedAt: true },
    }),
    prisma.agentRun.groupBy({ by: ["requesterUserId", "status"], where, _count: { _all: true } }),
    prisma.agentRun.findMany({
      where,
      distinct: ["requesterUserId", "sessionId"],
      select: { requesterUserId: true, sessionId: true },
    }),
    prisma.agentRun.groupBy({
      by: ["requesterUserId"],
      where: tokenCapturedWhere,
      _count: { _all: true },
    }),
    prisma.agentRun.groupBy({
      by: ["sessionId"],
      where,
      _count: { _all: true },
      _sum: {
        inputOtherTokens: true,
        inputCacheReadTokens: true,
        inputCacheCreationTokens: true,
        outputTokens: true,
      },
      _max: { startedAt: true },
    }),
    prisma.agentRun.groupBy({
      by: ["sessionId"],
      where: tokenCapturedWhere,
      _count: { _all: true },
    }),
    prisma.agentRun.groupBy({
      by: ["agentProfileId"],
      where,
      _count: { _all: true },
      _sum: {
        inputOtherTokens: true,
        inputCacheReadTokens: true,
        inputCacheCreationTokens: true,
        outputTokens: true,
      },
      _max: { contextUsagePeak: true },
    }),
    prisma.agentRun.groupBy({ by: ["agentProfileId"], where: tokenCapturedWhere, _count: { _all: true } }),
    prisma.agentProfile.findMany({ select: { id: true, key: true, displayName: true } }),
  ]);

  const statusMap = new Map(statusGroups.map((group) => [group.status, group._count._all]));
  const employeeStatusMap = new Map(employeeStatusGroups.map((group) => [
    `${group.requesterUserId}:${group.status}`,
    group._count._all,
  ]));
  const employeeSessionCount = new Map<number, number>();
  for (const pair of employeeSessionPairs) {
    employeeSessionCount.set(pair.requesterUserId, (employeeSessionCount.get(pair.requesterUserId) ?? 0) + 1);
  }
  const profileById = new Map(profileRows.map((profile) => [profile.id, profile]));
  const capturedByEmployee = new Map(capturedEmployeeGroups.map((group) => [group.requesterUserId, group._count._all]));
  const capturedBySession = new Map(capturedSessionGroups.map((group) => [group.sessionId, group._count._all]));
  const capturedByProfile = new Map(capturedTokenGroups.map((group) => [group.agentProfileId, group._count._all]));
  const requesterDirectory = options.canAudit
    ? await loadRequesterDirectory(employeeGroups.map((group) => group.requesterUserId))
    : new Map<number, { name: string; employeeId: string | null; departmentName: string | null }>();

  const topSessionIds = sessionGroups
    .slice()
    .sort((left, right) => (right._max.startedAt?.getTime() ?? 0) - (left._max.startedAt?.getTime() ?? 0))
    .slice(0, MAX_DETAIL_SESSIONS)
    .map((group) => group.sessionId);
  const sessionRows = options.canAudit && topSessionIds.length > 0
    ? await prisma.agentSession.findMany({
        where: { id: { in: topSessionIds } },
        select: {
          id: true,
          userId: true,
          title: true,
          contextLabel: true,
          pagePath: true,
          summaryShort: true,
          agentProfile: { select: { displayName: true } },
          runs: {
            where,
            orderBy: [{ startedAt: "desc" }, { id: "desc" }],
            take: 1,
            select: { status: true, resultType: true, proposalId: true },
          },
        },
      })
    : [];
  const { proposalStatusById, activeProposalStatusBySession } = await loadSessionProposalStates({
    sessionIds: sessionRows.map((session) => session.id),
    latestProposalIds: sessionRows.map((session) => session.runs[0]?.proposalId ?? null),
    fromDate,
    now,
  });
  const sessionGroupById = new Map(sessionGroups.map((group) => [group.sessionId, group]));

  return {
    generatedAt: now.toISOString(),
    period,
    canAudit: options.canAudit,
    metrics: {
      runCount: aggregate._count._all,
      sessionCount: sessionGroups.length,
      employeeCount: employeeGroups.length,
      runningCount: statusCount(statusMap, "running"),
      succeededCount: statusCount(statusMap, "succeeded"),
      failedCount: statusCount(statusMap, "failed"),
      abortedCount: statusCount(statusMap, "aborted"),
      tokenCapturedRunCount: [...capturedByProfile.values()].reduce((sum, value) => sum + value, 0),
      inputOtherTokens: numberOrZero(aggregate._sum.inputOtherTokens),
      inputCacheReadTokens: numberOrZero(aggregate._sum.inputCacheReadTokens),
      inputCacheCreationTokens: numberOrZero(aggregate._sum.inputCacheCreationTokens),
      outputTokens: numberOrZero(aggregate._sum.outputTokens),
      contextUsagePeak: aggregate._max.contextUsagePeak,
    },
    employees: options.canAudit
      ? employeeGroups.map((group) => {
          const requester = requesterDirectory.get(group.requesterUserId);
          return {
            userId: group.requesterUserId,
            employeeId: requester?.employeeId ?? null,
            employeeName: requester?.name ?? `用户 ${group.requesterUserId}`,
            departmentName: requester?.departmentName ?? null,
            runCount: group._count._all,
            sessionCount: employeeSessionCount.get(group.requesterUserId) ?? 0,
            succeededCount: employeeStatusMap.get(`${group.requesterUserId}:succeeded`) ?? 0,
            failedCount: employeeStatusMap.get(`${group.requesterUserId}:failed`) ?? 0,
            capturedRunCount: capturedByEmployee.get(group.requesterUserId) ?? 0,
            totalTokens: totalTokens(group._sum),
            lastUsedAt: group._max.startedAt?.toISOString() ?? null,
          };
        }).sort((left, right) => right.runCount - left.runCount || left.employeeName.localeCompare(right.employeeName, "zh-CN"))
      : [],
    tokenUsage: tokenGroups.map((group) => {
      const profile = group.agentProfileId == null ? null : profileById.get(group.agentProfileId);
      return {
        key: profile?.key ?? "self-assistant",
        agentName: profile?.displayName ?? "本人助手",
        runCount: group._count._all,
        capturedRunCount: capturedByProfile.get(group.agentProfileId) ?? 0,
        inputOtherTokens: numberOrZero(group._sum.inputOtherTokens),
        inputCacheReadTokens: numberOrZero(group._sum.inputCacheReadTokens),
        inputCacheCreationTokens: numberOrZero(group._sum.inputCacheCreationTokens),
        outputTokens: numberOrZero(group._sum.outputTokens),
        contextUsagePeak: group._max.contextUsagePeak,
      };
    }).sort((left, right) => right.runCount - left.runCount),
    sessions: sessionRows.map((session) => {
      const group = sessionGroupById.get(session.id)!;
      const latest = session.runs[0] ?? { status: "failed", resultType: "error", proposalId: null };
      return {
        id: session.id,
        title: session.title || session.contextLabel || session.pagePath || "未命名会话",
        contextLabel: session.contextLabel,
        pagePath: session.pagePath,
        summaryShort: session.summaryShort,
        employeeName: requesterDirectory.get(session.userId)?.name ?? `用户 ${session.userId}`,
        agentName: session.agentProfile?.displayName ?? "本人助手",
        runCount: group._count._all,
        capturedRunCount: capturedBySession.get(session.id) ?? 0,
        status: mergeAgentSessionReportStatus(
          deriveAgentReportStatus(
            latest,
            latest.proposalId == null ? null : proposalStatusById.get(latest.proposalId),
            now.getTime(),
          ),
          activeProposalStatusBySession.get(session.id),
        ),
        totalTokens: totalTokens(group._sum),
        lastUsedAt: group._max.startedAt!.toISOString(),
      };
    }).sort((left, right) => right.lastUsedAt.localeCompare(left.lastUsedAt)),
  };
}

export async function getAgentReportsData(options: { canAudit: boolean }): Promise<AgentReportsData> {
  const now = new Date();
  await Promise.all([
    reconcileStaleAgentRuns(now),
    reconcileStaleAgentProposalExecutions({ now }),
  ]);
  const { fromDate, period } = analysisPeriod(now);
  const where = { startedAt: { gte: fromDate, lte: now } } as const;
  const [profiles, sessionGroups] = await Promise.all([
    prisma.agentProfile.findMany({
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
      select: {
        id: true,
        key: true,
        displayName: true,
        roleName: true,
        runtimeBindings: {
          orderBy: [{ runtimeKind: "asc" }, { id: "asc" }],
          select: { id: true, runtimeKind: true, status: true },
        },
      },
    }),
    prisma.agentRun.groupBy({
      by: ["sessionId"],
      where,
      _count: { _all: true, proposalId: true },
      _min: { startedAt: true },
      _max: { startedAt: true },
    }),
  ]);
  const sessionIds = sessionGroups.map((group) => group.sessionId);
  const sessions = sessionIds.length > 0
    ? await prisma.agentSession.findMany({
        where: { id: { in: sessionIds } },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          userId: true,
          title: true,
          contextLabel: true,
          pagePath: true,
          summaryShort: true,
          agentProfile: { select: { id: true, key: true, displayName: true, roleName: true } },
          runs: {
            where,
            orderBy: [{ startedAt: "desc" }, { id: "desc" }],
            take: 1,
            select: {
              requesterUserId: true,
              status: true,
              resultType: true,
              proposalId: true,
              toolKey: true,
              errorMessage: true,
              agentProfileId: true,
              runtimeKind: true,
            },
          },
        },
      })
    : [];
  const { proposalStatusById, activeProposalStatusBySession } = await loadSessionProposalStates({
    sessionIds,
    latestProposalIds: sessions.map((session) => session.runs[0]?.proposalId ?? null),
    fromDate,
    now,
  });
  const sessionGroupById = new Map(sessionGroups.map((group) => [group.sessionId, group]));
  const requesterDirectory = options.canAudit
    ? await loadRequesterDirectory([...new Set(sessions.map((session) => session.userId))])
    : new Map<number, { name: string; employeeId: string | null; departmentName: string | null }>();

  const profileSummary = new Map<string, AgentReportProfileItem>();
  for (const profile of profiles) {
    const runtimeKinds = profile.runtimeBindings.map((binding) => asRuntimeKind(binding.runtimeKind));
    profileSummary.set(profile.key, {
      key: profile.key,
      agentName: profile.displayName,
      roleName: profile.roleName,
      runtimeKinds,
      configuredRuntimeCount: runtimeKinds.length,
      unreportedRuntimeCount: runtimeKinds.filter((kind) => kind !== "workspace").length,
      sessionCount: 0,
      runCount: 0,
      completedCount: 0,
      awaitingConfirmationCount: 0,
      awaitingInputCount: 0,
      exceptionCount: 0,
      lastRunAt: null,
    });
  }

  const reportRows = sessions.flatMap((session) => {
    const latest = session.runs[0];
    const group = sessionGroupById.get(session.id);
    if (!latest || !group || !group._min.startedAt || !group._max.startedAt) return [];
    const latestRunStatus = deriveAgentReportStatus(
      latest,
      latest.proposalId == null ? null : proposalStatusById.get(latest.proposalId),
      now.getTime(),
    );
    const status = mergeAgentSessionReportStatus(
      latestRunStatus,
      activeProposalStatusBySession.get(session.id),
    );
    const profileKey = session.agentProfile?.key ?? "self-assistant";
    let summary = profileSummary.get(profileKey);
    if (!summary) {
      summary = {
        key: profileKey,
        agentName: session.agentProfile?.displayName ?? "本人助手",
        roleName: session.agentProfile?.roleName ?? "员工个人助手",
        runtimeKinds: ["workspace"],
        configuredRuntimeCount: 1,
        unreportedRuntimeCount: 0,
        sessionCount: 0,
        runCount: 0,
        completedCount: 0,
        awaitingConfirmationCount: 0,
        awaitingInputCount: 0,
        exceptionCount: 0,
        lastRunAt: null,
      };
      profileSummary.set(profileKey, summary);
    }
    summary.sessionCount += 1;
    summary.runCount += group._count._all;
    if (status === "completed") summary.completedCount += 1;
    if (status === "awaiting_confirmation") summary.awaitingConfirmationCount += 1;
    if (status === "awaiting_input") summary.awaitingInputCount += 1;
    if (latestRunStatus === "failed" || latestRunStatus === "aborted") summary.exceptionCount += 1;
    if (!summary.lastRunAt || group._max.startedAt.toISOString() > summary.lastRunAt) {
      summary.lastRunAt = group._max.startedAt.toISOString();
    }

    if (!options.canAudit) return [];
    return [{
      sessionId: session.id,
      title: session.title || session.contextLabel || session.pagePath || "未命名会话",
      contextLabel: session.contextLabel,
      pagePath: session.pagePath,
      summaryShort: session.summaryShort,
      employeeName: requesterDirectory.get(session.userId)?.name ?? `用户 ${session.userId}`,
      agentName: session.agentProfile?.displayName ?? "本人助手",
      runtimeKind: asRuntimeKind(latest.runtimeKind),
      status,
      latestRunStatus,
      runCount: group._count._all,
      latestResultType: latest.resultType,
      latestToolKey: latest.toolKey,
      latestErrorMessage: latest.errorMessage,
      proposalCount: group._count.proposalId,
      startedAt: group._min.startedAt.toISOString(),
      lastRunAt: group._max.startedAt.toISOString(),
    }];
  });
  const statuses = sessions.flatMap((session) => {
    const latest = session.runs[0];
    if (!latest) return [];
    const latestRunStatus = deriveAgentReportStatus(
      latest,
      latest.proposalId == null ? null : proposalStatusById.get(latest.proposalId),
      now.getTime(),
    );
    return [{
      current: mergeAgentSessionReportStatus(
        latestRunStatus,
        activeProposalStatusBySession.get(session.id),
      ),
      latestRun: latestRunStatus,
    }];
  });
  const countReportStatus = (status: AgentReportStatus) => statuses.filter((value) => value.current === status).length;
  const externalReceipts = profiles.flatMap((profile) => profile.runtimeBindings.flatMap((binding) => {
    const kind = asRuntimeKind(binding.runtimeKind);
    if (kind === "workspace") return [];
    return [{
      key: `${profile.key}:${kind}`,
      agentName: profile.displayName,
      roleName: profile.roleName,
      runtimeKind: kind,
      bindingStatus: binding.status,
      receiptState: "not_connected" as const,
    }];
  }));

  return {
    generatedAt: now.toISOString(),
    period,
    canAudit: options.canAudit,
    metrics: {
      sessionCount: sessions.length,
      runningCount: countReportStatus("running"),
      completedCount: countReportStatus("completed"),
      awaitingConfirmationCount: countReportStatus("awaiting_confirmation"),
      awaitingInputCount: countReportStatus("awaiting_input"),
      exceptionCount: statuses.filter(({ latestRun }) => latestRun === "failed" || latestRun === "aborted").length,
      externalBindingCount: externalReceipts.length,
    },
    profiles: [...profileSummary.values()].sort((left, right) => (
      right.sessionCount - left.sessionCount || left.agentName.localeCompare(right.agentName, "zh-CN")
    )),
    reports: reportRows
      .sort((left, right) => right.lastRunAt.localeCompare(left.lastRunAt))
      .slice(0, MAX_DETAIL_SESSIONS),
    externalReceipts,
  };
}
