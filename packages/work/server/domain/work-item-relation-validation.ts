import { prisma } from "@workspace/platform/server/prisma";

export interface WorkItemRelationInput {
  planId?: number | null;
  targetType: string;
  targetId: number;
  currentWorkId?: number;
  itemType?: string;
  sourceType?: string;
  sourceKind?: string | null;
  sourceMeetingId?: number | null;
  sourceMeetingDecisionId?: number | null;
  sourceMeetingActionCandidateId?: number | null;
  ownerEmployeeId?: number | null;
  linkedProjectId?: number | null;
  linkedProjectPhaseId?: number | null;
  linkedProjectTaskId?: number | null;
  parentWorkItemId?: number | null;
}

export async function validateWorkItemRelations(input: WorkItemRelationInput) {
  if (!input.planId) return "必须选择 OKR 计划";
  const plan = await prisma.workPlan.findUnique({ where: { id: input.planId }, select: { targetType: true, targetId: true } });
  if (!plan) return "OKR 计划不存在";
  if (plan.targetType !== input.targetType || plan.targetId !== input.targetId) return "OKR 计划不属于当前空间";
  if (input.ownerEmployeeId) {
    const owner = await prisma.employee.findUnique({ where: { id: input.ownerEmployeeId }, select: { id: true } });
    if (!owner) return "负责人不存在";
  }
  if (input.sourceType === "project" && !input.linkedProjectId) return "项目来源工作项必须关联项目";
  if (input.sourceType === "meeting" && !input.sourceMeetingId && !input.sourceMeetingDecisionId && !input.sourceMeetingActionCandidateId) {
    return "会议来源工作项必须关联会议、决议或行动候选";
  }
  const meetingSourceError = await validateMeetingSource(input);
  if (meetingSourceError) return meetingSourceError;
  if (input.linkedProjectId) {
    const project = await prisma.project.findUnique({ where: { id: input.linkedProjectId }, select: { id: true } });
    if (!project) return "关联项目不存在";
  }
  if (input.linkedProjectPhaseId) {
    const phase = await prisma.projectPlanPhase.findUnique({ where: { id: input.linkedProjectPhaseId }, select: { id: true, projectId: true } });
    if (!phase) return "关联项目阶段不存在";
    if (input.linkedProjectId && phase.projectId !== input.linkedProjectId) return "关联项目阶段不属于所选项目";
  }
  if (input.linkedProjectTaskId) {
    const task = await prisma.projectTask.findUnique({ where: { id: input.linkedProjectTaskId }, select: { id: true, projectId: true } });
    if (!task) return "关联项目任务不存在";
    if (input.linkedProjectId && task.projectId !== input.linkedProjectId) return "关联项目任务不属于所选项目";
  }
  if (input.sourceType === "project" && input.sourceKind === "project_phase" && !input.linkedProjectPhaseId) return "项目阶段来源必须关联项目阶段";
  if (input.sourceType === "project" && input.sourceKind === "project_task" && !input.linkedProjectTaskId) return "项目任务来源必须关联项目任务";
  if (input.itemType === "key_result" && !input.parentWorkItemId) return "KR 必须选择上级目标";
  if (input.parentWorkItemId) {
    const parentError = await validateParentRelation(input);
    if (parentError) return parentError;
  }
  return null;
}

async function validateParentRelation(input: WorkItemRelationInput) {
  if (!input.parentWorkItemId) return null;
  if (input.currentWorkId && input.parentWorkItemId === input.currentWorkId) return "上级工作项不能选择自己";
  const parent = await prisma.workItem.findUnique({
    where: { id: input.parentWorkItemId },
    select: { id: true, targetType: true, targetId: true, itemType: true, parentWorkItemId: true },
  });
  if (!parent) return "上级工作项不存在";
  if (parent.targetType !== input.targetType || parent.targetId !== input.targetId) return "上级工作项不属于当前空间";
  const parentPlan = await prisma.workItem.findUnique({
    where: { id: input.parentWorkItemId },
    select: { planId: true },
  });
  if (parentPlan?.planId !== input.planId) return "上级工作项不属于当前 OKR 计划";
  if (input.itemType === "key_result" && parent.itemType !== "objective") return "KR 必须挂在 O/目标下";
  if (input.itemType === "objective" && parent.itemType !== "objective") return "O/目标只能作为根节点或挂在上级 O/目标下";
  if (input.itemType === "task" && parent.itemType === "task") return "子任务只能挂在目标或关键结果下";
  let cursor = parent.parentWorkItemId;
  while (cursor) {
    if (input.currentWorkId && cursor === input.currentWorkId) return "上级工作项不能选择自己的子节点";
    const ancestor = await prisma.workItem.findUnique({
      where: { id: cursor },
      select: { parentWorkItemId: true },
    });
    cursor = ancestor?.parentWorkItemId ?? null;
  }
  return null;
}

async function validateMeetingSource(input: Pick<WorkItemRelationInput, "sourceType" | "sourceMeetingId" | "sourceMeetingDecisionId" | "sourceMeetingActionCandidateId">) {
  if (input.sourceType !== "meeting") return null;
  let meetingId = input.sourceMeetingId ?? null;
  if (meetingId) {
    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { id: true } });
    if (!meeting) return "来源会议不存在";
  }
  if (input.sourceMeetingDecisionId) {
    const decision = await prisma.meetingDecision.findUnique({
      where: { id: input.sourceMeetingDecisionId },
      select: { meetingId: true },
    });
    if (!decision) return "来源会议决议不存在";
    if (meetingId && decision.meetingId !== meetingId) return "来源会议决议不属于所选会议";
    meetingId = decision.meetingId;
  }
  if (input.sourceMeetingActionCandidateId) {
    const candidate = await prisma.meetingActionCandidate.findUnique({
      where: { id: input.sourceMeetingActionCandidateId },
      select: { meetingId: true },
    });
    if (!candidate) return "来源会议行动候选不存在";
    if (meetingId && candidate.meetingId !== meetingId) return "来源会议行动候选不属于所选会议";
  }
  return null;
}
