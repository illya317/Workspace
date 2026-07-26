import "server-only";

import { flattenWorkspaceAnalysisNestedValue } from "@workspace/platform/server/workspace-analysis-nested-values";
import { runRegisteredWorkspaceAnalysisSource } from "@workspace/platform/server/workspace-analysis-source-executor";
import type { WorkspaceAnalysisSourceRegistration } from "@workspace/platform/server/workspace-analysis-source-registry";
import {
  WorkspaceAnalysisRuntimeError,
  type WorkspaceAnalysisSourceLoadRequest,
} from "@workspace/platform/server/workspace-analysis-runtime";

import { executeListDepartmentCollaborationsCommand } from "./department-collaboration-route-command";
import { listProjectMembers } from "./project-members";
import { listProjectGantt, listProjects } from "./projects";
import { getMeetingDetail, listMeetings } from "./meetings";
import {
  buildWorkWorkspaceAnalysisSourceCatalog,
  canDiscoverWorkWorkspaceAnalysisSource,
} from "./workspace-analysis-source-access";
import { executeListKpiDefinitionsCommand } from "./work-kpi-route-command";
import { executeListWorkPlansCommand } from "./work-plan-route-command";
import {
  executeAssignedDepartmentWorkItemsRouteCommand,
  executeWorkPeriodCollectionRouteCommand,
  executeWorkReportCollectionRouteCommand,
} from "./work-task-route-command";
import { getWorkItems } from "./works";
import {
  iterateWorkReportAnalysisRows,
  iterateWorkReportItemAnalysisRows,
} from "./workspace-analysis-report-sources";
import {
  iterateWorkPeriodCollectionCycleRows,
  iterateWorkPeriodCollectionItemRows,
  iterateWorkPeriodCollectionOverlapRows,
  iterateWorkPeriodCollectionPlanRows,
} from "./workspace-analysis-period-collection-sources";
import {
  iterateWorkProjectGanttLeaderAnalysisRows,
  iterateWorkProjectGanttProjectAnalysisRows,
} from "./workspace-analysis-project-gantt-sources";
import {
  iterateWorkAssignedItemAnalysisRows,
  iterateWorkAssignedPlanGroupAnalysisRows,
} from "./workspace-analysis-assigned-sources";
import {
  iterateWorkMeetingActionCandidateRows,
  iterateWorkMeetingAgendaItemRows,
  iterateWorkMeetingDecisionRows,
  iterateWorkMeetingDetailParticipantRows,
  iterateWorkMeetingMinuteEntryRows,
  iterateWorkMeetingProposalRows,
  iterateWorkMeetingProposalVoteRows,
  type WorkMeetingDetail,
} from "./workspace-analysis-meeting-detail-sources";
import { loadWorkParameterizedDetailSource } from "./workspace-analysis-parameter-detail-executor";

type LoadedRows = { readonly rows: readonly unknown[]; readonly totalRows: number };

export function loadWorkWorkspaceAnalysisSource(request: WorkspaceAnalysisSourceLoadRequest) {
  const catalog = buildWorkWorkspaceAnalysisSourceCatalog();
  let loadedRows: Promise<LoadedRows> | undefined;

  return runRegisteredWorkspaceAnalysisSource({
    ownerUnitId: "work",
    sourceCatalog: catalog,
    request,
    canExecute: canDiscoverWorkWorkspaceAnalysisSource,
    loadPage: async ({ registration, requesterId, targetType, targetId, parameters, page, pageSize, signal }) => {
      if (signal.aborted) throw cancelled(request.sourceKey);
      loadedRows ??= loadPublicRows({
        registration,
        requesterId,
        targetType,
        targetId,
        parameters,
        maxRows: request.limits.maxRows,
        signal,
      });
      const loaded = await loadedRows;
      if (signal.aborted) throw cancelled(request.sourceKey);
      const start = (page - 1) * pageSize;
      return {
        rows: loaded.rows.slice(start, start + pageSize),
        totalRows: loaded.totalRows,
      };
    },
  });
}

async function loadPublicRows(input: {
  readonly registration: WorkspaceAnalysisSourceRegistration;
  readonly requesterId: number;
  readonly targetType: WorkspaceAnalysisSourceLoadRequest["targetType"];
  readonly targetId: number;
  readonly parameters: WorkspaceAnalysisSourceLoadRequest["parameters"];
  readonly maxRows: number;
  readonly signal: AbortSignal;
}): Promise<LoadedRows> {
  const sourceKey = input.registration.definition.sourceKey;
  if (input.signal.aborted) throw cancelled(sourceKey);
  const detail = await loadWorkParameterizedDetailSource({
    requesterId: input.requesterId, parameters: input.parameters, sourceKey,
    maxRows: input.maxRows, label: input.registration.definition.label,
  });
  if (detail) return detail;

  switch (sourceKey) {
    case "work.items": {
      const rows = await getWorkItems({
        targetType: input.targetType,
        targetId: input.targetId,
        planId: integerParameter(input.parameters.planId),
        category: textParameter(input.parameters.category),
        periodType: textParameter(input.parameters.periodType),
        periodStart: textParameter(input.parameters.periodStart),
        includeArchived: booleanParameter(input.parameters.includeArchived),
      });
      return { rows, totalRows: rows.length };
    }
    case "work.item-evidence": {
      const items = await getWorkItems({
        targetType: input.targetType,
        targetId: input.targetId,
        planId: integerParameter(input.parameters.planId),
        category: textParameter(input.parameters.category),
        periodType: textParameter(input.parameters.periodType),
        periodStart: textParameter(input.parameters.periodStart),
        includeArchived: booleanParameter(input.parameters.includeArchived),
      });
      const rows = items.flatMap((item) => item.evidenceTasks.map((evidence) => ({
        workItemId: item.id,
        planId: item.planId,
        targetType: item.targetType,
        targetId: item.targetId,
        itemType: item.itemType,
        status: item.status,
        ...evidence,
      })));
      return { rows, totalRows: rows.length };
    }
    case "work.item-participants": {
      const items = await getWorkItems({
        targetType: input.targetType,
        targetId: input.targetId,
        planId: integerParameter(input.parameters.planId),
        category: textParameter(input.parameters.category),
        periodType: textParameter(input.parameters.periodType),
        periodStart: textParameter(input.parameters.periodStart),
        includeArchived: booleanParameter(input.parameters.includeArchived),
      });
      const rows = items.flatMap((item) => item.participants.map((participant) => ({
        ...participant,
        planId: item.planId,
        targetType: item.targetType,
        targetId: item.targetId,
      })));
      return { rows, totalRows: rows.length };
    }
    case "work.plans": {
      const rows = await loadPublicWorkPlans(input, sourceKey);
      return { rows, totalRows: rows.length };
    }
    case "work.plan-approval-snapshot-values": {
      const plans = await loadPublicWorkPlans(input, sourceKey);
      const rows = plans.flatMap((plan) => [
        ...approvalSnapshotRows(plan, "objective", plan.objectiveApprovalSnapshotJson),
        ...approvalSnapshotRows(plan, "kr", plan.krApprovalSnapshotJson),
      ]);
      return { rows, totalRows: rows.length };
    }
    case "work.department-collaborations":
    case "work.department-collaboration-enabling-departments":
    case "work.department-collaboration-responsible-positions":
    case "work.department-collaboration-executor-positions":
    case "work.department-collaboration-plans":
    case "work.department-collaboration-items": {
      const collaborations = await loadPublicDepartmentCollaborations(input, sourceKey);
      if (sourceKey === "work.department-collaborations") {
        return { rows: collaborations, totalRows: collaborations.length };
      }
      if (sourceKey === "work.department-collaboration-enabling-departments") {
        const rows = collaborations.flatMap((collaboration) => collaboration.enablingDepartments.map((entry) => ({
          ...entry,
          collaborationId: collaboration.id,
          collaborationTitle: collaboration.title,
        })));
        return { rows, totalRows: rows.length };
      }
      if (sourceKey === "work.department-collaboration-responsible-positions") {
        const rows = collaborations.flatMap((collaboration) => collaboration.responsiblePositions.map((entry) => ({
          ...entry,
          collaborationId: collaboration.id,
          collaborationTitle: collaboration.title,
        })));
        return { rows, totalRows: rows.length };
      }
      if (sourceKey === "work.department-collaboration-executor-positions") {
        const rows = collaborations.flatMap((collaboration) => collaboration.executorPositions.map((entry) => ({
          ...entry,
          collaborationId: collaboration.id,
          collaborationTitle: collaboration.title,
        })));
        return { rows, totalRows: rows.length };
      }
      if (sourceKey === "work.department-collaboration-plans") {
        const rows = collaborations.flatMap((collaboration) => collaboration.workPlans.map((entry) => ({
          ...entry,
          collaborationId: collaboration.id,
          collaborationTitle: collaboration.title,
        })));
        return { rows, totalRows: rows.length };
      }
      const rows = collaborations.flatMap((collaboration) => collaboration.workItems.map((entry) => ({
        ...entry,
        collaborationId: collaboration.id,
        collaborationTitle: collaboration.title,
      })));
      return { rows, totalRows: rows.length };
    }
    case "work.kpi-definitions":
    case "work.kpi-definition-scoring-rule-values": {
      const definitions = await loadPublicKpiDefinitions(input, sourceKey);
      if (sourceKey === "work.kpi-definitions") {
        return { rows: definitions, totalRows: definitions.length };
      }
      const rows = definitions.flatMap((definition) => (
        flattenWorkspaceAnalysisNestedValue(definition.scoringRule).map((value) => ({
          rowKey: `${definition.id}:${value.path}`,
          definitionId: definition.id,
          definitionCode: definition.code,
          definitionVersion: definition.version,
          definitionName: definition.name,
          ...value,
        }))
      ));
      return { rows, totalRows: rows.length };
    }
    case "work.reports":
    case "work.report-items": {
      const result = await executeWorkReportCollectionRouteCommand({
        userId: input.requesterId,
        periodType: textParameter(input.parameters.periodType) ?? null,
        periodStart: textParameter(input.parameters.periodStart) ?? null,
      });
      if (!result.ok) throw serviceFailure(result, sourceKey, "工作汇报汇总");
      const rows = sourceKey === "work.reports"
        ? collectBoundedRows(
            iterateWorkReportAnalysisRows(result.data),
            input.maxRows,
            sourceKey,
            input.registration.definition.label,
          )
        : collectBoundedRows(
            iterateWorkReportItemAnalysisRows(result.data),
            input.maxRows,
            sourceKey,
            input.registration.definition.label,
          );
      return { rows, totalRows: rows.length };
    }
    case "work.assigned-plan-groups":
    case "work.assigned-items": {
      const result = await executeAssignedDepartmentWorkItemsRouteCommand({ userId: input.requesterId });
      if (!result.ok) throw serviceFailure(result, sourceKey, "我的承接事项");
      const rows = sourceKey === "work.assigned-plan-groups"
        ? collectBoundedRows(iterateWorkAssignedPlanGroupAnalysisRows(result.data), input.maxRows, sourceKey, input.registration.definition.label)
        : collectBoundedRows(iterateWorkAssignedItemAnalysisRows(result.data), input.maxRows, sourceKey, input.registration.definition.label);
      return { rows, totalRows: rows.length };
    }
    case "work.period-collection-cycles":
    case "work.period-collection-plans":
    case "work.period-collection-items":
    case "work.period-collection-overlaps": {
      const cycleId = integerParameter(input.parameters.cycleId);
      if (!cycleId) {
        throw new WorkspaceAnalysisRuntimeError("source_response_invalid", "工作周期集合缺少根周期", sourceKey);
      }
      const includeItems = sourceKey === "work.period-collection-items" || sourceKey === "work.period-collection-overlaps";
      const result = await executeWorkPeriodCollectionRouteCommand({
        userId: input.requesterId,
        targetType: input.targetType,
        targetId: input.targetId,
        cycleId,
        displayPeriodType: textParameter(input.parameters.displayPeriodType) ?? null,
        includeItems,
      });
      if (!result.ok) throw serviceFailure(result, sourceKey, "工作周期集合");
      const rows = sourceKey === "work.period-collection-cycles"
        ? collectBoundedRows(iterateWorkPeriodCollectionCycleRows(result.data), input.maxRows, sourceKey, input.registration.definition.label)
        : sourceKey === "work.period-collection-plans"
          ? collectBoundedRows(iterateWorkPeriodCollectionPlanRows(result.data), input.maxRows, sourceKey, input.registration.definition.label)
          : sourceKey === "work.period-collection-items"
            ? collectBoundedRows(iterateWorkPeriodCollectionItemRows(result.data), input.maxRows, sourceKey, input.registration.definition.label)
            : collectBoundedRows(iterateWorkPeriodCollectionOverlapRows(result.data), input.maxRows, sourceKey, input.registration.definition.label);
      return { rows, totalRows: rows.length };
    }
    case "work.project-gantt-projects":
    case "work.project-gantt-leaders": {
      const data = await listProjectGantt({ userId: input.requesterId, includeTasks: false });
      const rows = sourceKey === "work.project-gantt-projects"
        ? collectBoundedRows(iterateWorkProjectGanttProjectAnalysisRows(data), input.maxRows, sourceKey, input.registration.definition.label)
        : collectBoundedRows(iterateWorkProjectGanttLeaderAnalysisRows(data), input.maxRows, sourceKey, input.registration.definition.label);
      return { rows, totalRows: rows.length };
    }
    case "work.projects": {
      const result = await listProjects({
        userId: input.requesterId,
        keyword: textParameter(input.parameters.keyword) ?? "",
        page: 1,
        pageSize: input.registration.definition.limits.maxRows,
        archived: booleanParameter(input.parameters.archived) ?? false,
      });
      return { rows: result.projects, totalRows: result.total };
    }
    case "work.project-enabling-departments": {
      const result = await listProjects({
        userId: input.requesterId,
        keyword: textParameter(input.parameters.keyword) ?? "",
        page: 1,
        pageSize: input.registration.definition.limits.maxRows,
        archived: booleanParameter(input.parameters.archived) ?? false,
      });
      const rows = result.projects.flatMap((project) => project.enablingDepartments.map((department) => ({
        projectId: project.id,
        projectCode: project.code,
        projectName: project.name,
        departmentId: department.id,
        departmentCode: department.code,
        departmentName: department.name,
      })));
      return { rows, totalRows: rows.length };
    }
    case "work.project-members": {
      const result = await listProjectMembers({
        userId: input.requesterId,
        projectId: input.targetId,
        keyword: textParameter(input.parameters.keyword) ?? "",
        page: 1,
        pageSize: input.registration.definition.limits.maxRows,
      });
      return { rows: result.entries, totalRows: result.total };
    }
    case "work.meetings": {
      const result = await listMeetings({
        userId: input.requesterId,
        typeId: integerParameter(input.parameters.typeId),
      });
      if (!result.ok) throw serviceFailure(result, sourceKey, "会议");
      return { rows: result.data.meetings, totalRows: result.data.meetings.length };
    }
    case "work.meeting-participants": {
      const result = await listMeetings({
        userId: input.requesterId,
        typeId: integerParameter(input.parameters.typeId),
      });
      if (!result.ok) throw serviceFailure(result, sourceKey, "会议");
      const rows = result.data.meetings.flatMap((meeting) => meeting.participants.map((participant) => ({
        meetingId: meeting.id,
        meetingTitle: meeting.title,
        meetingStartAt: meeting.startAt,
        ...participant,
      })));
      return { rows, totalRows: rows.length };
    }
    case "work.meeting-details":
    case "work.meeting-detail-participants":
    case "work.meeting-agenda-items":
    case "work.meeting-minute-entries":
    case "work.meeting-proposals":
    case "work.meeting-proposal-votes":
    case "work.meeting-decisions":
    case "work.meeting-action-candidates": {
      const meeting = await loadPublicMeetingDetail(input, sourceKey);
      const rows = collectBoundedRows(
        meetingDetailRows(sourceKey, meeting),
        input.maxRows,
        sourceKey,
        input.registration.definition.label,
      );
      return { rows, totalRows: rows.length };
    }
    default:
      throw new WorkspaceAnalysisRuntimeError("source_unavailable", "Work 经营分析数据源不存在", sourceKey);
  }
}

function meetingDetailRows(sourceKey: string, meeting: WorkMeetingDetail): readonly unknown[] {
  switch (sourceKey) {
    case "work.meeting-details": return [meeting];
    case "work.meeting-detail-participants": return iterateWorkMeetingDetailParticipantRows(meeting);
    case "work.meeting-agenda-items": return iterateWorkMeetingAgendaItemRows(meeting);
    case "work.meeting-minute-entries": return iterateWorkMeetingMinuteEntryRows(meeting);
    case "work.meeting-proposals": return iterateWorkMeetingProposalRows(meeting);
    case "work.meeting-proposal-votes": return iterateWorkMeetingProposalVoteRows(meeting);
    case "work.meeting-decisions": return iterateWorkMeetingDecisionRows(meeting);
    default: return iterateWorkMeetingActionCandidateRows(meeting);
  }
}

async function loadPublicMeetingDetail(
  input: {
    readonly requesterId: number;
    readonly parameters: WorkspaceAnalysisSourceLoadRequest["parameters"];
  },
  sourceKey: string,
) {
  const meetingId = integerParameter(input.parameters.meetingId);
  if (!meetingId) {
    throw new WorkspaceAnalysisRuntimeError("source_response_invalid", "会议详情来源缺少会议 ID", sourceKey);
  }

  const detail = await getMeetingDetail({ userId: input.requesterId, meetingId });
  if (!detail.ok) throw serviceFailure(detail, sourceKey, "会议详情");
  return detail.data.meeting;
}

async function loadPublicWorkPlans(
  input: {
    readonly requesterId: number;
    readonly targetType: WorkspaceAnalysisSourceLoadRequest["targetType"];
    readonly targetId: number;
    readonly parameters: WorkspaceAnalysisSourceLoadRequest["parameters"];
  },
  sourceKey: string,
) {
  const result = await executeListWorkPlansCommand({
    userId: input.requesterId,
    targetType: input.targetType,
    targetId: input.targetId,
    kind: textParameter(input.parameters.kind),
    includeArchived: booleanParameter(input.parameters.includeArchived) ?? false,
  });
  if (!result.ok) throw serviceFailure(result, sourceKey, "工作计划");
  return result.data.plans;
}

async function loadPublicDepartmentCollaborations(
  input: {
    readonly requesterId: number;
    readonly targetId: number;
  },
  sourceKey: string,
) {
  const result = await executeListDepartmentCollaborationsCommand({
    userId: input.requesterId,
    departmentId: input.targetId,
  });
  if (!result.ok) throw serviceFailure(result, sourceKey, "部门协作");
  return result.data.collaborations;
}

async function loadPublicKpiDefinitions(
  input: {
    readonly requesterId: number;
    readonly targetType: WorkspaceAnalysisSourceLoadRequest["targetType"];
    readonly targetId: number;
    readonly parameters: WorkspaceAnalysisSourceLoadRequest["parameters"];
  },
  sourceKey: string,
) {
  const ownerDepartmentId = integerParameter(input.parameters.ownerDepartmentId);
  const result = await executeListKpiDefinitionsCommand({
    actorUserId: input.requesterId,
    targetType: input.targetType,
    targetId: input.targetId,
    ...(ownerDepartmentId ? { ownerDepartmentId } : {}),
    includeRetired: booleanParameter(input.parameters.includeRetired) ?? false,
  });
  if (!result.ok) throw serviceFailure(result, sourceKey, "KPI 指标定义");
  return result.data.definitions;
}

function approvalSnapshotRows(
  plan: {
    readonly id: number;
    readonly title: string;
    readonly targetType: string;
    readonly targetId: number;
  },
  snapshotKind: "objective" | "kr",
  snapshotJson: string,
) {
  const normalized = normalizeApprovalSnapshotJson(snapshotJson);
  return flattenWorkspaceAnalysisNestedValue(normalized.value).map((value) => ({
    rowKey: `${plan.id}:${snapshotKind}:${value.path}`,
    planId: plan.id,
    planTitle: plan.title,
    targetType: plan.targetType,
    targetId: plan.targetId,
    snapshotKind,
    parseStatus: normalized.parseStatus,
    ...value,
  }));
}

function normalizeApprovalSnapshotJson(snapshotJson: string): {
  readonly parseStatus: "parsed" | "empty" | "invalid";
  readonly value: unknown;
} {
  if (!snapshotJson.trim()) return { parseStatus: "empty", value: null };
  try {
    return { parseStatus: "parsed", value: JSON.parse(snapshotJson) as unknown };
  } catch {
    return { parseStatus: "invalid", value: snapshotJson };
  }
}

function serviceFailure(
  result: { readonly error: string; readonly status?: number },
  sourceKey: string,
  label: string,
) {
  return new WorkspaceAnalysisRuntimeError(
    result.status === 403 ? "source_forbidden" : "source_unavailable",
    result.error || `${label}数据暂不可用`,
    sourceKey,
  );
}

function textParameter(value: string | number | boolean | undefined) { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function integerParameter(value: string | number | boolean | undefined) { return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined; }

function booleanParameter(value: string | number | boolean | undefined) { return typeof value === "boolean" ? value : undefined; }

function collectBoundedRows<T>(
  iterable: Iterable<T>,
  maxRows: number,
  sourceKey: string,
  label: string,
) {
  const rows: T[] = [];
  for (const row of iterable) {
    rows.push(row);
    if (rows.length > maxRows) {
      throw new WorkspaceAnalysisRuntimeError(
        "source_limit_exceeded",
        `${label}超过登记行数上限`,
        sourceKey,
      );
    }
  }
  return rows;
}

function cancelled(sourceKey: string) {
  return new WorkspaceAnalysisRuntimeError("cancelled", "经营分析运行已取消", sourceKey);
}
