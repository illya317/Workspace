import type { Prisma } from "@workspace/platform/server/prisma";
import { failCommand, okCommand } from "@workspace/platform/server/domain-validation";
import { findPerformanceArchiveReferences } from "../performance-reference-adapter";

export interface HrPerformanceReviewArchiveInput {
  employeeId: number;
  okrCycleId: number;
  approvalRequestId: number;
  selfScore?: number | null;
  selfComment?: string | null;
  managerScore?: number | null;
  managerComment?: string | null;
  finalScore?: number | null;
  finalGrade?: string | null;
  hrComment?: string | null;
  workEvidenceSnapshotJson: string;
  archivedByUserId: number;
}

const ALLOWED_GRADES = ["S", "A", "B", "C", "D"];

export async function buildHrPerformanceReviewArchiveCommand(input: HrPerformanceReviewArchiveInput) {
  if (!Number.isInteger(input.employeeId) || input.employeeId <= 0) return failCommand("员工 ID 无效", 400, "employeeId");
  if (!Number.isInteger(input.okrCycleId) || input.okrCycleId <= 0) return failCommand("绩效周期无效", 400, "okrCycleId");
  if (!isScore(input.finalScore)) return failCommand("HR 最终评分必须为 0-100", 400, "finalScore");
  if (!isScore(input.managerScore)) return failCommand("直属上级评分必须为 0-100", 400, "managerScore");
  const finalGrade = String(input.finalGrade || "").trim().toUpperCase();
  if (!ALLOWED_GRADES.includes(finalGrade)) return failCommand("HR 最终等级必须为 S/A/B/C/D", 400, "finalGrade");

  const { employee, cycle, duplicate } = await findPerformanceArchiveReferences(input.employeeId, input.okrCycleId);
  if (!employee) return failCommand("员工不存在", 404, "employeeId");
  if (!cycle) return failCommand("OKR 周期不存在", 404, "okrCycleId");
  if (duplicate) return failCommand("该员工在当前周期已有正式绩效记录", 409, "okrCycleId");

  return okCommand({
    data: {
      employeeId: input.employeeId,
      okrCycleId: input.okrCycleId,
      approvalRequestId: input.approvalRequestId,
      selfScore: input.selfScore ?? null,
      selfComment: String(input.selfComment || ""),
      managerScore: input.managerScore,
      managerComment: String(input.managerComment || ""),
      finalScore: input.finalScore,
      finalGrade,
      hrComment: String(input.hrComment || ""),
      workEvidenceSnapshotJson: input.workEvidenceSnapshotJson,
      archivedByUserId: input.archivedByUserId,
      editedBy: input.archivedByUserId,
      editedAt: new Date(),
    } satisfies Prisma.HrPerformanceReviewUncheckedCreateInput,
  });
}

function isScore(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 100;
}
