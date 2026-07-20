import {
  createProposal,
  type AgentExecutionContext,
  type AgentTool,
  type ProposalExecutors,
} from "@workspace/platform/server/agent";

import {
  buildCreateHrPerformanceSubmissionRouteCommand,
  buildHrPerformanceSubmissionActionRouteCommand,
  executeCreateHrPerformanceSubmissionRouteCommand,
  executeListHrPerformanceDashboardRouteCommand,
  executeReviseHrPerformanceSubmissionRouteCommand,
  executeSubmitHrPerformanceSubmissionRouteCommand,
} from "./performance";
import {
  buildGetHrPerformanceContributionDetailRouteCommand,
  executeGetHrPerformanceContributionDetailRouteCommand,
} from "./performance-contribution-detail";
import {
  buildAgentPerformanceSelfReviewCommand,
  parseStoredAgentPerformanceSelfReview,
} from "./domain/agent-performance-proposal-validation";

const PERFORMANCE_READ = { resourceKey: "hr.performance", action: "read" } as const;
const PERFORMANCE_SUBMIT = { resourceKey: "hr.performance", action: "submit" } as const;
const SUBMIT_SELF_REVIEW_ACTION = "hr.submitMyPerformanceReview";

export const getMyPerformanceContextTool: AgentTool = {
  key: "hr.getMyPerformanceContext",
  label: "读取本人绩效材料",
  description: "读取当前用户在指定或当前绩效周期的 Work 贡献、目标材料、正式结果和流程状态。只能用于本人绩效自评和状态查询；回答必须引用工具返回的事实，不得补造业绩。",
  parameters: {
    type: "object",
    properties: {
      cycleId: { type: "integer", minimum: 1, description: "可选绩效周期 ID；不传时使用当前活动周期" },
    },
    additionalProperties: false,
  },
  examples: [
    { user: "帮我整理本期绩效", arguments: {} },
    { user: "查看周期 12 的绩效材料", arguments: { cycleId: 12 } },
  ],
  requiredPermissions: [PERFORMANCE_READ],
  mutates: false,

  async execute(params, execution) {
    const cycleId = positiveInteger(params.cycleId);
    if (params.cycleId !== undefined && !cycleId) return { type: "error", message: "绩效周期 ID 无效" };
    const resolved = await resolveMyPerformanceContext(execution.actor.id, cycleId);
    if (!resolved.ok) return { type: "error", message: resolved.message };
    return {
      type: "data",
      message: `已读取 ${resolved.data.employee.name} 的 ${resolved.data.cycle.label} 绩效材料。`,
      data: resolved.data,
      modelContext: resolved.data,
    };
  },
};

export const submitMyPerformanceReviewTool: AgentTool = {
  key: SUBMIT_SELF_REVIEW_ACTION,
  label: "提交本人绩效自评",
  description: "在用户已经检查自评内容并明确要求提交后，为当前用户生成本人绩效自评提案。必须提供 0-100 整数 selfScore 和完整 selfComment；本工具只生成待确认提案，确认后才沿用现有 HR 绩效流程保存并提交。",
  parameters: {
    type: "object",
    properties: {
      cycleId: { type: "integer", minimum: 1, description: "可选绩效周期 ID；不传时使用当前活动周期" },
      selfScore: { type: "integer", minimum: 0, maximum: 100, description: "本人自评分" },
      selfComment: { type: "string", minLength: 20, maxLength: 4000, description: "用户已经确认的完整绩效自评" },
      comment: { type: "string", maxLength: 500, description: "可选流程备注" },
    },
    required: ["selfScore", "selfComment"],
    additionalProperties: false,
  },
  examples: [{
    user: "按刚才的草稿以 88 分提交",
    arguments: { selfScore: 88, selfComment: "本周期围绕既定目标完成了……" },
  }],
  requiredPermissions: [PERFORMANCE_READ, PERFORMANCE_SUBMIT],
  mutates: true,

  async execute(params, execution) {
    const command = buildAgentPerformanceSelfReviewCommand(params);
    if (!command.ok) return { type: "error", message: command.issue.message };
    const resolved = await resolveMyPerformanceContext(execution.actor.id, command.data.cycleId);
    if (!resolved.ok) return { type: "error", message: resolved.message };
    const { employee, cycle, currentSubmission, formalReview } = resolved.data;
    if (formalReview) return { type: "error", message: "当前周期已有正式绩效记录，不能重复提交自评。" };
    if (currentSubmission && currentSubmission.status === "submitted") {
      return { type: "error", message: "当前绩效自评已经提交，需先在绩效流程中撤回后再修改。" };
    }
    if (!currentSubmission && !resolved.data.canCreate) {
      return { type: "error", message: "当前绩效流程不允许发起本人自评。" };
    }
    if (currentSubmission && currentSubmission.editability !== "editable") {
      return { type: "error", message: "当前绩效流程状态不可编辑。" };
    }
    const expectedRequest = currentSubmission ? {
      id: currentSubmission.id,
      version: currentSubmission.version,
      status: currentSubmission.status,
    } : null;
    const diff = {
      员工: `${employee.name}（${employee.employeeId}）`,
      绩效周期: cycle.label,
      自评分: command.data.selfScore,
      自评内容: command.data.selfComment,
      动作: currentSubmission ? "更新并提交现有绩效自评" : "创建并提交绩效自评",
    };
    const proposal = await createProposal(execution, {
      actionKey: SUBMIT_SELF_REVIEW_ACTION,
      toolKey: SUBMIT_SELF_REVIEW_ACTION,
      targetType: "HrPerformanceReview",
      targetId: `${employee.id}:${cycle.id}`,
      payload: {
        employeeId: employee.id,
        okrCycleId: cycle.id,
        selfScore: command.data.selfScore,
        selfComment: command.data.selfComment,
        comment: command.data.comment,
        expectedRequest,
      },
      diff,
    });
    return {
      type: "proposal",
      message: "绩效自评已生成待确认提案；确认后才会写入并提交现有 HR 绩效流程。",
      proposal: {
        id: proposal.proposalId,
        actionKey: SUBMIT_SELF_REVIEW_ACTION,
        targetType: "HrPerformanceReview",
        targetId: `${employee.id}:${cycle.id}`,
        diff,
      },
    };
  },
};

async function executePerformanceSelfReviewProposal(
  payload: Record<string, unknown>,
  execution: AgentExecutionContext,
) {
  const parsed = parseStoredAgentPerformanceSelfReview(payload);
  if (!parsed.ok) throw new Error(parsed.issue.message);
  const context = await resolveMyPerformanceContext(execution.actor.id, parsed.data.okrCycleId);
  if (!context.ok) throw new Error(context.message);
  if (context.data.employee.id !== parsed.data.employeeId) throw new Error("绩效提案不属于当前用户");
  if (context.data.formalReview) throw new Error("当前周期已有正式绩效记录");
  assertExpectedSubmission(context.data.currentSubmission, parsed.data.expectedRequest);

  const reviewPayload = {
    selfScore: parsed.data.selfScore,
    selfComment: parsed.data.selfComment,
    managerScore: null,
    managerComment: "",
    finalScore: null,
    finalGrade: "",
    hrComment: "",
  };
  let request: { id: number; version: number };
  if (parsed.data.expectedRequest) {
    const reviseCommand = buildHrPerformanceSubmissionActionRouteCommand({
      userId: execution.actor.id,
      requestId: parsed.data.expectedRequest.id,
      body: {
        payload: reviewPayload,
        comment: parsed.data.comment,
        version: parsed.data.expectedRequest.version,
      },
    });
    if (!reviseCommand.ok) throw new Error(reviseCommand.issue.message);
    const revised = await executeReviseHrPerformanceSubmissionRouteCommand(reviseCommand.data);
    if (!revised.ok) throw new Error(revised.error);
    request = approvalRequestFrom(revised.data);
  } else {
    const createCommand = buildCreateHrPerformanceSubmissionRouteCommand({
      userId: execution.actor.id,
      body: {
        employeeId: parsed.data.employeeId,
        okrCycleId: parsed.data.okrCycleId,
        payload: reviewPayload,
        comment: parsed.data.comment,
      },
    });
    if (!createCommand.ok) throw new Error(createCommand.issue.message);
    const created = await executeCreateHrPerformanceSubmissionRouteCommand(createCommand.data);
    if (!created.ok) throw new Error(created.error);
    request = approvalRequestFrom(created.data);
  }
  const submitCommand = buildHrPerformanceSubmissionActionRouteCommand({
    userId: execution.actor.id,
    requestId: request.id,
    body: { comment: parsed.data.comment, version: request.version },
  });
  if (!submitCommand.ok) throw new Error(submitCommand.issue.message);
  const submitted = await executeSubmitHrPerformanceSubmissionRouteCommand(submitCommand.data);
  if (!submitted.ok) throw new Error(`自评内容已保存，但提交失败：${submitted.error}`);
  return { success: true, result: submitted.data };
}

async function resolveMyPerformanceContext(userId: number, requestedCycleId: number | null) {
  const dashboard = await executeListHrPerformanceDashboardRouteCommand({
    userId,
    cycleId: requestedCycleId,
  });
  if (!dashboard.ok) return { ok: false as const, message: dashboard.error };
  const employee = dashboard.data.currentEmployee;
  const cycleId = requestedCycleId ?? dashboard.data.activeCycleId;
  const cycle = dashboard.data.cycleOptions.find((item) => item.id === cycleId) ?? null;
  if (!employee) return { ok: false as const, message: "当前账号未绑定在职员工，无法读取本人绩效材料。" };
  if (!cycle) return { ok: false as const, message: "没有找到可用的绩效周期。" };
  const detailCommand = buildGetHrPerformanceContributionDetailRouteCommand({
    userId,
    audienceType: "personal",
    audienceId: employee.id,
    cycleId: cycle.id,
  });
  if (!detailCommand.ok) return { ok: false as const, message: detailCommand.issue.message };
  const detail = await executeGetHrPerformanceContributionDetailRouteCommand(detailCommand.data);
  if (!detail.ok) return { ok: false as const, message: detail.error };
  const currentSubmission = dashboard.data.submissionRows.find((row) => (
    row.employeeId === employee.id && row.okrCycleId === cycle.id
  )) ?? null;
  const formalReview = dashboard.data.reviewRows.find((row) => (
    row.employeeId === employee.id && row.okrCycleId === cycle.id
  )) ?? null;
  return {
    ok: true as const,
    data: {
      employee,
      cycle,
      canCreate: dashboard.data.createRuntime.actions.includes("workflow.request.submit"),
      currentSubmission: currentSubmission ? {
        id: currentSubmission.id,
        version: currentSubmission.version,
        status: currentSubmission.status,
        editability: currentSubmission.actionRuntime.editability,
        selfScore: currentSubmission.selfScore,
        selfComment: currentSubmission.selfComment,
        updatedAt: currentSubmission.updatedAt,
      } : null,
      formalReview,
      workEvidence: detail.data.dossier,
      contributionRows: dashboard.data.contributionRows
        .filter((row) => row.employeeId === employee.id)
        .slice(0, 50),
      links: {
        performance: "/work/performance",
        work: "/work/me",
      },
    },
  };
}

function assertExpectedSubmission(
  current: { id: number; version: number; status: string } | null,
  expected: { id: number; version: number; status: string } | null,
) {
  if (!expected && current) throw new Error("绩效流程状态已经变化，请重新生成提案");
  if (expected && !current) throw new Error("原绩效流程已不存在，请重新生成提案");
  if (expected && current && (
    current.id !== expected.id || current.version !== expected.version || current.status !== expected.status
  )) throw new Error("绩效流程版本已经变化，请重新生成提案");
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function approvalRequestFrom(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("绩效流程没有返回流程单");
  const request = (value as { request?: unknown }).request;
  if (!request || typeof request !== "object") throw new Error("绩效流程没有返回流程单");
  const id = Number((request as { id?: unknown }).id);
  const version = Number((request as { version?: unknown }).version);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(version) || version < 0) {
    throw new Error("绩效流程返回的流程版本无效");
  }
  return { id, version };
}

export const performanceAgentTools: AgentTool[] = [
  getMyPerformanceContextTool,
  submitMyPerformanceReviewTool,
];

export const performanceAgentProposalExecutors: ProposalExecutors = {
  [SUBMIT_SELF_REVIEW_ACTION]: {
    toolKey: SUBMIT_SELF_REVIEW_ACTION,
    requiredPermissions: [PERFORMANCE_READ, PERFORMANCE_SUBMIT],
    failureMayHaveSideEffects: true,
    execute: executePerformanceSelfReviewProposal,
  },
};
