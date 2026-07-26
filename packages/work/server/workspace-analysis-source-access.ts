import "server-only";

import type { WorkspaceAnalysisSourceDefinition } from "@workspace/platform/workspace-analysis-source-contract";
import { canEnterResource, evaluatePermissionAction } from "@workspace/platform/server/auth";
import { createWorkspaceAnalysisSourceCatalog } from "@workspace/platform/server/workspace-analysis-source-registry";

import {
  canUseProject,
  canViewProject,
  canViewWorkTaskTarget,
} from "./access";
import { canUseMeetings } from "./meeting-access";
import { WORK_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS } from "./workspace-analysis-sources";

export function buildWorkWorkspaceAnalysisSourceCatalog() {
  const catalog = createWorkspaceAnalysisSourceCatalog(WORK_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS);
  catalog.validateReferences();
  return catalog;
}

export async function canDiscoverWorkWorkspaceAnalysisSource(input: {
  readonly requesterId: number;
  readonly targetType: "personal" | "department" | "project";
  readonly targetId: number;
  readonly source: WorkspaceAnalysisSourceDefinition;
}) {
  if (input.source.ownerModuleKey !== "work" || !input.source.scopeBindings[input.targetType]) return false;
  if (input.source.authorization.enforcement === "gateway" && !(await hasInheritedGatewayAccess(input))) return false;

  switch (input.source.sourceKey) {
    case "work.items":
    case "work.item-evidence":
    case "work.item-participants":
    case "work.plans":
    case "work.plan-approval-snapshot-values":
    case "work.department-collaborations":
    case "work.department-collaboration-enabling-departments":
    case "work.department-collaboration-responsible-positions":
    case "work.department-collaboration-executor-positions":
    case "work.department-collaboration-plans":
    case "work.department-collaboration-items":
    case "work.kpi-definitions":
    case "work.kpi-definition-scoring-rule-values":
    case "work.period-collection-cycles":
    case "work.period-collection-plans":
    case "work.period-collection-items":
    case "work.period-collection-overlaps":
      return canViewWorkTaskTarget(input.requesterId, input.targetType, input.targetId);
    case "work.reports":
    case "work.report-items":
    case "work.assigned-plan-groups":
    case "work.assigned-items":
    case "work.project-plan-phases":
    case "work.project-plan-baselines":
    case "work.project-plan-gantt-items":
    case "work.project-plan-gantt-owners":
    case "work.project-plan-dependencies":
    case "work.project-plan-baseline-items":
    case "work.kpi-scorecard-plans":
    case "work.kpi-scorecard-assignments":
    case "work.kpi-scorecard-definitions":
    case "work.kpi-scorecard-source-assignments":
    case "work.kpi-scorecard-definition-snapshot-values":
    case "work.kpi-scorecard-scoring-rule-values":
    case "work.kpi-scorecard-definition-scoring-rule-values":
    case "work.kpi-scorecard-evidence-tasks":
    case "work.kpi-scorecard-latest-results":
    case "work.kpi-result-summaries":
    case "work.kpi-result-previews":
    case "work.kpi-result-work-reports":
    case "work.kpi-result-definition-snapshot-values":
    case "work.kpi-result-assignment-snapshot-values":
    case "work.kpi-result-scoring-rule-values":
    case "work.kpi-result-evidence-values":
      // The protected collection route is requester-scoped and delegates row
      // or parameter-scoped and delegates object visibility to its owning
      // service. Rechecking the current page target would invent a second
      // permission for these viewer-scoped sources.
      return true;
    case "work.projects":
    case "work.project-enabling-departments":
    case "work.project-gantt-projects":
    case "work.project-gantt-leaders":
      return canUseProject(input.requesterId);
    case "work.project-members":
      return input.targetType === "project" && canViewProject(input.requesterId, input.targetId);
    case "work.meetings":
    case "work.meeting-participants":
    case "work.meeting-details":
    case "work.meeting-detail-participants":
    case "work.meeting-agenda-items":
    case "work.meeting-minute-entries":
    case "work.meeting-proposals":
    case "work.meeting-proposal-votes":
    case "work.meeting-decisions":
    case "work.meeting-action-candidates":
      return canUseMeetings(input.requesterId);
    default:
      return false;
  }
}

async function hasInheritedGatewayAccess(input: {
  readonly requesterId: number;
  readonly source: WorkspaceAnalysisSourceDefinition;
}) {
  for (const action of input.source.authorization.requiredActions) {
    const allowed = action === "entry"
      ? await canEnterResource(input.requesterId, input.source.authorization.resourceKey)
      : await evaluatePermissionAction(
          input.requesterId,
          input.source.authorization.resourceKey,
          action,
          { projection: input.source.authorization.projection },
        );
    if (!allowed) return false;
  }
  return true;
}
