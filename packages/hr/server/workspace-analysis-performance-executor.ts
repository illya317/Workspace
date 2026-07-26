import "server-only";

import { flattenWorkspaceAnalysisNestedValue } from "@workspace/platform/server/workspace-analysis-nested-values";
import { prisma } from "@workspace/platform/server/prisma";
import { WorkspaceAnalysisRuntimeError } from "@workspace/platform/server/workspace-analysis-runtime";

import { executeListHrPerformanceDashboardRouteCommand } from "./performance";
import {
  isHrPerformanceWorkspaceAnalysisSourceKey,
  type HrPerformanceDashboardData,
  type HrPerformanceReviewDetailAnalysisRow,
  type HrPerformanceReviewEvidenceValueAnalysisRow,
  type HrPerformanceReportingAnalysisRow,
} from "./workspace-analysis-performance-sources";

type PerformanceTargetType = "personal" | "department" | "project";
type PerformancePeriodType = "yearly" | "half_year" | "quarterly" | "monthly" | "weekly";
const MAX_VISIBLE_REVIEW_IDS = 5_000;
const MAX_EVIDENCE_VALUE_ROWS = 10_000;
const MAX_EVIDENCE_SNAPSHOT_BYTES = 10 * 1024 * 1024;

export { isHrPerformanceWorkspaceAnalysisSourceKey };

export async function loadHrPerformanceWorkspaceAnalysisRows(input: {
  readonly sourceKey: string;
  readonly requesterId: number;
  readonly targetType: PerformanceTargetType;
  readonly targetId: number;
  readonly parameters: Readonly<Record<string, string | number | boolean>>;
}): Promise<readonly unknown[]> {
  if (!isHrPerformanceWorkspaceAnalysisSourceKey(input.sourceKey)) {
    throw new WorkspaceAnalysisRuntimeError("source_unavailable", "HR 绩效经营分析数据源不存在", input.sourceKey);
  }
  const bindsTargetAudience = input.targetType !== "personal" && input.sourceKey !== "hr.performance-cycles";
  const result = await executeListHrPerformanceDashboardRouteCommand({
    userId: input.requesterId,
    view: input.targetType === "personal" ? "self" : "summary",
    cycleId: integerParameter(input.parameters.cycleId),
    periodType: periodTypeParameter(input.parameters.periodType, input.sourceKey),
    audienceType: bindsTargetAudience ? input.targetType : null,
    audienceId: bindsTargetAudience ? input.targetId : null,
    keyword: textParameter(input.parameters.keyword),
    status: "",
  });
  if (!result.ok) {
    throw new WorkspaceAnalysisRuntimeError(
      result.status === 403 ? "source_forbidden" : "source_unavailable",
      result.error || "HR 绩效数据暂不可用",
      input.sourceKey,
    );
  }
  if (input.sourceKey === "hr.performance-review-details") {
    return loadVisibleReviewDetails(result.data, input.sourceKey);
  }
  if (input.sourceKey === "hr.performance-review-evidence-values") {
    return loadVisibleReviewEvidenceValues(result.data, input.sourceKey);
  }
  return selectPerformanceRows(result.data, input.sourceKey, input.targetType);
}

async function loadVisibleReviewDetails(
  dashboard: HrPerformanceDashboardData,
  sourceKey: string,
): Promise<Array<Omit<HrPerformanceReviewDetailAnalysisRow, "workEvidenceSnapshot">>> {
  const visibleReviewIds = boundedVisibleReviewIds(dashboard, sourceKey);
  if (!visibleReviewIds.length) return [];
  const visibleReviewIdSet = new Set(visibleReviewIds);
  const reviews = await prisma.hrPerformanceReview.findMany({
    where: { id: { in: visibleReviewIds } },
    select: {
      id: true,
      employeeId: true,
      okrCycleId: true,
      approvalRequestId: true,
      selfScore: true,
      selfComment: true,
      managerScore: true,
      managerComment: true,
      finalScore: true,
      finalGrade: true,
      hrComment: true,
      archivedAt: true,
      version: true,
      createdAt: true,
      updatedAt: true,
      employee: { select: { employeeId: true, name: true } },
    },
  });
  const rowsById = new Map(reviews
    .filter((review) => visibleReviewIdSet.has(review.id))
    .map((review) => [review.id, {
      id: review.id,
      employeeId: review.employeeId,
      employeeCode: review.employee.employeeId,
      employeeName: review.employee.name,
      okrCycleId: review.okrCycleId,
      approvalRequestId: review.approvalRequestId,
      selfScore: review.selfScore,
      managerScore: review.managerScore,
      finalScore: review.finalScore,
      finalGrade: review.finalGrade,
      archivedAt: review.archivedAt.toISOString(),
      version: review.version,
      selfComment: review.selfComment,
      managerComment: review.managerComment,
      hrComment: review.hrComment,
      createdAt: review.createdAt.toISOString(),
      updatedAt: review.updatedAt.toISOString(),
    } satisfies Omit<HrPerformanceReviewDetailAnalysisRow, "workEvidenceSnapshot">]));
  return visibleReviewIds.flatMap((id) => {
    const row = rowsById.get(id);
    return row ? [row] : [];
  });
}

async function loadVisibleReviewEvidenceValues(
  dashboard: HrPerformanceDashboardData,
  sourceKey: string,
): Promise<HrPerformanceReviewEvidenceValueAnalysisRow[]> {
  const visibleReviewIds = boundedVisibleReviewIds(dashboard, sourceKey);
  if (!visibleReviewIds.length) return [];
  const visibleReviewIdSet = new Set(visibleReviewIds);
  const reviews = await prisma.hrPerformanceReview.findMany({
    where: { id: { in: visibleReviewIds } },
    select: {
      id: true,
      employeeId: true,
      okrCycleId: true,
      workEvidenceSnapshotJson: true,
      employee: { select: { employeeId: true, name: true } },
    },
  });
  const reviewsById = new Map(reviews
    .filter((review) => visibleReviewIdSet.has(review.id))
    .map((review) => [review.id, review]));
  const rows: HrPerformanceReviewEvidenceValueAnalysisRow[] = [];
  let snapshotBytes = 0;
  for (const reviewId of visibleReviewIds) {
    const review = reviewsById.get(reviewId);
    if (!review) continue;
    snapshotBytes += new TextEncoder().encode(review.workEvidenceSnapshotJson).byteLength;
    if (snapshotBytes > MAX_EVIDENCE_SNAPSHOT_BYTES) {
      throw limitExceeded(sourceKey, "HR 绩效归档证据快照超过登记字节上限");
    }
    for (const value of flattenWorkspaceAnalysisNestedValue(parseJson(review.workEvidenceSnapshotJson, sourceKey))) {
      rows.push({
        rowKey: `${review.id}:${value.path}`,
        reviewId: review.id,
        employeeId: review.employeeId,
        employeeCode: review.employee.employeeId,
        employeeName: review.employee.name,
        okrCycleId: review.okrCycleId,
        ...value,
      });
      if (rows.length > MAX_EVIDENCE_VALUE_ROWS) {
        throw limitExceeded(sourceKey, "HR 绩效归档证据字段超过登记行数上限");
      }
    }
  }
  return rows;
}

function boundedVisibleReviewIds(dashboard: HrPerformanceDashboardData, sourceKey: string) {
  const reviewIds = [...new Set(dashboard.reviewRows.map((review) => review.id))];
  if (reviewIds.length > MAX_VISIBLE_REVIEW_IDS) {
    throw limitExceeded(sourceKey, "HR 可见绩效记录超过有界批量读取上限");
  }
  return reviewIds;
}

function selectPerformanceRows(
  dashboard: HrPerformanceDashboardData,
  sourceKey: string,
  targetType: PerformanceTargetType,
): readonly unknown[] {
  switch (sourceKey) {
    case "hr.performance-attendance":
      return dashboard.attendanceRows;
    case "hr.performance-work-plans":
      return targetType === "personal"
        ? dashboard.workRows
        : dashboard.workRows.filter((row) => row.employeeId !== null);
    case "hr.performance-contributions":
      return dashboard.contributionRows;
    case "hr.performance-reviews":
      return dashboard.reviewRows;
    case "hr.performance-cycles":
      return dashboard.cycleOptions;
    case "hr.performance-reporting":
      return reportingRows(dashboard, targetType);
    default:
      throw new WorkspaceAnalysisRuntimeError("source_unavailable", "HR 绩效经营分析数据源不存在", sourceKey);
  }
}

function reportingRows(
  dashboard: HrPerformanceDashboardData,
  targetType: PerformanceTargetType,
): HrPerformanceReportingAnalysisRow[] {
  if (targetType === "personal") {
    return dashboard.contributionDirectories.personal.map((row) => reportingRow({
      audienceType: targetType,
      audienceId: row.id,
      audienceCode: row.employeeId,
      audienceName: row.name,
      reportingApplicable: dashboard.reportingSummary.applicable,
      reporting: row.reporting,
    }));
  }
  if (targetType === "department") {
    return dashboard.contributionDirectories.department.map((row) => reportingRow({
      audienceType: targetType,
      audienceId: row.id,
      audienceCode: row.code,
      audienceName: row.name,
      reportingApplicable: dashboard.reportingSummary.applicable,
      reporting: row.reporting,
    }));
  }
  return dashboard.contributionDirectories.project.map((row) => reportingRow({
    audienceType: targetType,
    audienceId: row.id,
    audienceCode: row.code,
    audienceName: row.name,
    reportingApplicable: dashboard.reportingSummary.applicable,
    reporting: row.reporting,
  }));
}

function reportingRow(input: {
  readonly audienceType: PerformanceTargetType;
  readonly audienceId: number;
  readonly audienceCode: string;
  readonly audienceName: string;
  readonly reportingApplicable: boolean;
  readonly reporting: { readonly status: string; readonly deadline: string | null; readonly submittedAt: string | null } | null;
}): HrPerformanceReportingAnalysisRow {
  return {
    audienceType: input.audienceType,
    audienceId: input.audienceId,
    audienceCode: input.audienceCode,
    audienceName: input.audienceName,
    reportingApplicable: input.reportingApplicable,
    reportingStatus: input.reporting?.status ?? null,
    deadline: input.reporting?.deadline ?? null,
    submittedAt: input.reporting?.submittedAt ?? null,
  };
}

function integerParameter(value: string | number | boolean | undefined) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function textParameter(value: string | number | boolean | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function periodTypeParameter(
  value: string | number | boolean | undefined,
  sourceKey: string,
): PerformancePeriodType | null {
  if (value === undefined || value === "") return null;
  if (value === "yearly" || value === "half_year" || value === "quarterly" || value === "monthly" || value === "weekly") {
    return value;
  }
  throw new WorkspaceAnalysisRuntimeError("source_response_invalid", "绩效周期类型无效", sourceKey);
}

function parseJson(value: string, sourceKey: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new WorkspaceAnalysisRuntimeError(
      "source_response_invalid",
      "HR 绩效归档证据快照不是有效 JSON",
      sourceKey,
    );
  }
}

function limitExceeded(sourceKey: string, message: string) {
  return new WorkspaceAnalysisRuntimeError("source_limit_exceeded", message, sourceKey);
}
