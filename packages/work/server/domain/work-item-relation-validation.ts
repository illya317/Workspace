import { validateWorkSourceDepartmentSelection } from "../work-source-departments";
import { validateWorkOwnerAssignment } from "../work-owner-eligibility";
import { validateWorkCollaborationReference } from "../work-collaboration-references";
import {
  findMeetingActionCandidateReference,
  findMeetingDecisionReference,
  findMeetingReference,
  findParentWorkItemReference,
  findProjectPhaseRelationReference,
  findProjectRelationReference,
  findWorkItemParentId,
  findWorkPlanRelationReference,
} from "../work-item-reference-adapter";

export interface WorkItemRelationInput {
  actorUserId?: number | null;
  ownerEligibilityUserId?: number | null;
  planId?: number | null;
  targetType: string;
  targetId: number;
  currentWorkId?: number;
  itemType?: string;
  status?: string | null;
  sourceType?: string;
  sourceKind?: string | null;
  sourceMeetingId?: number | null;
  sourceMeetingDecisionId?: number | null;
  sourceMeetingActionCandidateId?: number | null;
  sourceDepartmentId?: number | null;
  ownerEmployeeId?: number | null;
  collaborationId?: number | null;
  linkedProjectId?: number | null;
  linkedProjectPhaseId?: number | null;
  parentWorkItemId?: number | null;
}

export async function validateWorkItemRelations(input: WorkItemRelationInput) {
  if (!input.planId) return "必须选择工作计划";
  const plan = await findWorkPlanRelationReference(input.planId);
  if (!plan) return "工作计划不存在";
  if (plan.targetType !== input.targetType || plan.targetId !== input.targetId) return "工作计划不属于当前空间";
  if (plan.isArchived) return "已归档计划不能新增、恢复或调整工作项";
  if (plan.status === "done" && input.status !== "done") return "已完成计划下不能保留未完成工作项";
  if (plan.collaborationId && input.collaborationId && plan.collaborationId !== input.collaborationId) return "任务关联的部门协作必须与所属计划一致";
  const collaborationId = input.collaborationId ?? plan.collaborationId;
  const collaborationError = await validateWorkCollaborationReference({
    ...input,
    collaborationId,
    actorUserId: input.ownerEligibilityUserId ?? input.actorUserId,
  });
  if (collaborationError) return collaborationError;
  if (input.ownerEmployeeId) {
    const ownerError = await validateWorkOwnerAssignment({
      actorUserId: input.ownerEligibilityUserId ?? input.actorUserId,
      targetType: input.targetType,
      targetId: input.targetId,
      collaborationId,
      ownerEmployeeId: input.ownerEmployeeId,
    });
    if (ownerError) return ownerError;
  }
  if (hasDepartmentOrProjectSource(input) && input.targetType !== "personal") return "只有个人工作项可以引用部门或项目来源";
  if (input.sourceType === "project" && !input.linkedProjectId) return "项目来源工作项必须关联项目";
  if (input.sourceType === "meeting" && !input.sourceMeetingId && !input.sourceMeetingDecisionId && !input.sourceMeetingActionCandidateId) {
    return "会议来源工作项必须关联会议、决议或行动候选";
  }
  const sourceDepartmentError = await validateWorkSourceDepartmentSelection({
    userId: input.actorUserId,
    sourceType: input.sourceType,
    sourceDepartmentId: input.sourceDepartmentId,
  });
  if (sourceDepartmentError) return sourceDepartmentError;
  const meetingSourceError = await validateMeetingSource(input);
  if (meetingSourceError) return meetingSourceError;
  if (input.linkedProjectId) {
    const project = await findProjectRelationReference(input.linkedProjectId);
    if (!project) return "关联项目不存在";
  }
  if (input.linkedProjectPhaseId) {
    const phase = await findProjectPhaseRelationReference(input.linkedProjectPhaseId);
    if (!phase) return "关联项目阶段不存在";
    if (input.linkedProjectId && phase.projectId !== input.linkedProjectId) return "关联项目阶段不属于所选项目";
  }
  if (input.sourceType === "project" && input.sourceKind === "project_phase" && !input.linkedProjectPhaseId) return "项目阶段来源必须关联项目阶段";
  if (input.itemType === "objective" && input.parentWorkItemId) return "O/目标只能作为根节点";
  if (input.itemType === "key_result" && !input.parentWorkItemId) return "KR 必须选择上级目标";
  if (input.itemType === "task" && !input.parentWorkItemId && plan.kind !== "routine") return "任务必须选择所属目标";
  if (input.parentWorkItemId) {
    const parentError = await validateParentRelation(input);
    if (parentError) return parentError;
  }
  return null;
}

function hasDepartmentOrProjectSource(input: Pick<WorkItemRelationInput, "sourceType" | "sourceDepartmentId" | "linkedProjectId" | "linkedProjectPhaseId">) {
  return input.sourceType === "department"
    || input.sourceType === "project"
    || Boolean(input.sourceDepartmentId)
    || Boolean(input.linkedProjectId)
    || Boolean(input.linkedProjectPhaseId);
}

async function validateParentRelation(input: WorkItemRelationInput) {
  if (!input.parentWorkItemId) return null;
  if (input.currentWorkId && input.parentWorkItemId === input.currentWorkId) return "上级工作项不能选择自己";
  const parent = await findParentWorkItemReference(input.parentWorkItemId);
  if (!parent) return "上级工作项不存在";
  if (parent.targetType !== input.targetType || parent.targetId !== input.targetId) return "上级工作项不属于当前空间";
  if (parent.planId !== input.planId) return "上级工作项不属于当前 OKR 计划";
  if (parent.isArchived) return "上级工作项已归档";
  if (parent.status === "done" && input.status !== "done") return "已完成上级工作项下不能保留未完成子项";
  if (input.itemType === "key_result" && parent.itemType !== "objective") return "KR 必须挂在 O/目标下";
  if (input.itemType === "objective") return "O/目标只能作为根节点";
  if (input.itemType === "task" && parent.itemType !== "objective") {
    const routineParentAllowed = parent.routineTaskType === "standing" && parent.status === "active" && !parent.isArchived;
    if (!routineParentAllowed) return "任务只能挂在 O/目标或生效中的常设职责下";
  }
  if (parent.parentWorkItemId) return "任务和 KR 必须直接挂在根级 O/目标下";
  let cursor = parent.parentWorkItemId;
  while (cursor) {
    if (input.currentWorkId && cursor === input.currentWorkId) return "上级工作项不能选择自己的子节点";
    const ancestor = await findWorkItemParentId(cursor);
    cursor = ancestor?.parentWorkItemId ?? null;
  }
  return null;
}

async function validateMeetingSource(input: Pick<WorkItemRelationInput, "sourceType" | "sourceMeetingId" | "sourceMeetingDecisionId" | "sourceMeetingActionCandidateId">) {
  if (input.sourceType !== "meeting") return null;
  let meetingId = input.sourceMeetingId ?? null;
  if (meetingId) {
    const meeting = await findMeetingReference(meetingId);
    if (!meeting) return "来源会议不存在";
  }
  if (input.sourceMeetingDecisionId) {
    const decision = await findMeetingDecisionReference(input.sourceMeetingDecisionId);
    if (!decision) return "来源会议决议不存在";
    if (meetingId && decision.meetingId !== meetingId) return "来源会议决议不属于所选会议";
    meetingId = decision.meetingId;
  }
  if (input.sourceMeetingActionCandidateId) {
    const candidate = await findMeetingActionCandidateReference(input.sourceMeetingActionCandidateId);
    if (!candidate) return "来源会议行动候选不存在";
    if (meetingId && candidate.meetingId !== meetingId) return "来源会议行动候选不属于所选会议";
  }
  return null;
}
