import "server-only";

import { flattenWorkspaceAnalysisNestedValue } from "@workspace/platform/server/workspace-analysis-nested-values";
import { runRegisteredWorkspaceAnalysisSource } from "@workspace/platform/server/workspace-analysis-source-executor";
import { WorkspaceAnalysisRuntimeError, type WorkspaceAnalysisSourceLoadRequest } from "@workspace/platform/server/workspace-analysis-runtime";

import { listContracts } from "./contracts";
import { listErpDiligenceWorkspace } from "./erp-diligence";
import {
  buildAdministrationWorkspaceAnalysisSourceCatalog,
  canDiscoverAdministrationWorkspaceAnalysisSource,
} from "./workspace-analysis-source-access";

export function loadAdministrationWorkspaceAnalysisSource(request: WorkspaceAnalysisSourceLoadRequest) {
  return runRegisteredWorkspaceAnalysisSource({
    ownerUnitId: "administration",
    sourceCatalog: buildAdministrationWorkspaceAnalysisSourceCatalog(),
    request,
    canExecute: canDiscoverAdministrationWorkspaceAnalysisSource,
    loadPage: async ({ registration, parameters, page, pageSize, signal }) => {
      if (signal.aborted) throw new WorkspaceAnalysisRuntimeError("cancelled", "经营分析运行已取消", request.sourceKey);
      const sourceKey = registration.definition.sourceKey;
      if (sourceKey === "administration.contracts") {
        const result = await listContracts({
          userId: request.requesterId,
          q: text(parameters.keyword),
          location: text(parameters.location),
          category: text(parameters.category),
          lifecycleStatus: text(parameters.lifecycleStatus),
          ownerDepartmentId: integer(parameters.ownerDepartmentId),
          page,
          pageSize,
        });
        return { rows: result.contracts, totalRows: result.total };
      }
      if (!sourceKey.startsWith("administration.erp-diligence.")) {
        throw new WorkspaceAnalysisRuntimeError("source_unavailable", "行政经营分析数据源暂不可用", request.sourceKey);
      }
      const workspace = await listErpDiligenceWorkspace({ userId: request.requesterId });
      if (signal.aborted) throw new WorkspaceAnalysisRuntimeError("cancelled", "经营分析运行已取消", request.sourceKey);
      const submissions = visibleSubmissions(workspace);
      if (sourceKey === "administration.erp-diligence.submissions") {
        return paginate(submissions, page, pageSize);
      }
      if (sourceKey === "administration.erp-diligence.answers") {
        return paginate(submissions.flatMap((submission) => (
          flattenWorkspaceAnalysisNestedValue(submission.answers).map((value) => ({
            rowKey: `${submission.id}:${value.path}`,
            ...submissionContext(submission),
            ...value,
          }))
        )), page, pageSize);
      }
      if (sourceKey === "administration.erp-diligence.process-steps") {
        return paginate(submissions.flatMap((submission) => submission.processSteps.map((step, stepOrdinal) => ({
          rowKey: `${submission.id}:${step.key}:${stepOrdinal}`,
          ...submissionContext(submission),
          stepOrdinal,
          ...step,
        }))), page, pageSize);
      }
      if (sourceKey === "administration.erp-diligence.process-step-pain-points") {
        return paginate(submissions.flatMap((submission) => submission.processSteps.flatMap((step, stepOrdinal) => (
          step.painPoints.map((painPoint, painPointOrdinal) => ({
            rowKey: `${submission.id}:${step.key}:${stepOrdinal}:${painPointOrdinal}`,
            submissionId: submission.id,
            processStepKey: step.key,
            stepOrdinal,
            painPointOrdinal,
            painPoint,
          }))
        ))), page, pageSize);
      }
      if (sourceKey === "administration.erp-diligence.evidence-items") {
        return paginate(submissions.flatMap((submission) => submission.evidenceItems.map((evidence, evidenceOrdinal) => ({
          rowKey: `${submission.id}:${evidence.key}:${evidenceOrdinal}`,
          ...submissionContext(submission),
          evidenceOrdinal,
          ...evidence,
        }))), page, pageSize);
      }
      if (sourceKey === "administration.erp-diligence.evidence-attachments") {
        return paginate(submissions.flatMap((submission) => submission.evidenceItems.flatMap((evidence, evidenceOrdinal) => (
          (evidence.attachments ?? []).map((attachment, attachmentOrdinal) => ({
            rowKey: `${submission.id}:${evidence.key}:${evidenceOrdinal}:${attachmentOrdinal}`,
            submissionId: submission.id,
            respondentUserId: submission.respondentUserId,
            evidenceOrdinal,
            attachmentOrdinal,
            ...attachment,
          }))
        ))), page, pageSize);
      }
      throw new WorkspaceAnalysisRuntimeError("source_unavailable", "行政经营分析数据源暂不可用", request.sourceKey);
    },
  });
}

function text(value: string | number | boolean | undefined) {
  return typeof value === "string" ? value : undefined;
}

function integer(value: string | number | boolean | undefined) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function visibleSubmissions(workspace: Awaited<ReturnType<typeof listErpDiligenceWorkspace>>) {
  const byId = new Map(workspace.submissions.map((submission) => [submission.id, submission]));
  if (workspace.submission) byId.set(workspace.submission.id, workspace.submission);
  return [...byId.values()];
}

function submissionContext(submission: Awaited<ReturnType<typeof listErpDiligenceWorkspace>>["submissions"][number]) {
  return {
    submissionId: submission.id,
    respondentUserId: submission.respondentUserId,
    respondentName: submission.respondentName,
    departmentName: submission.departmentName,
    roleTitle: submission.roleTitle,
  };
}

function paginate(rows: readonly unknown[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), totalRows: rows.length };
}
