import type { AgentExecutionContext, AgentTool } from "@workspace/platform/server/agent";

import {
  listAssignedDepartmentWorkPlanGroups,
  listAssignedPersonalCollaborationWorkPlanGroups,
} from "./work-assigned-items";
import { intersectWorkSpaces } from "./agent-work-overview-model";
import { listWorkTaskSpaces, type WorkTaskSpace } from "./task-spaces";
import { workItemAgentTools } from "./work-item-agent-tools";
export { workItemAgentProposalExecutors } from "./work-item-agent-tools";

type SharedWorkSpace = WorkTaskSpace & {
  actionPermissions: WorkTaskSpace["actionPermissions"];
};

export const getMyWorkOverviewTool: AgentTool = {
  key: "work.getMyOverview",
  label: "读取 Work 工作概览",
  description: "读取当前执行身份有权访问、且请求人同样有权查看的 Work 空间、目标数量和被分配事项。用于回答工作重点、周报、项目执行和待推进事项；不得据此执行写入。",
  parameters: {
    type: "object",
    properties: {
      focus: {
        type: "string",
        enum: ["all", "spaces", "assigned"],
        description: "all=全部概览，spaces=工作空间，assigned=被分配事项",
      },
    },
    additionalProperties: false,
  },
  examples: [
    { user: "梳理我的重点事项", arguments: { focus: "all" } },
    { user: "我参与了哪些工作空间", arguments: { focus: "spaces" } },
  ],
  requiredPermissions: [{ resourceKey: "work.tasks", action: "entry" }],
  delegatedExecution: true,
  mutates: false,

  async execute(params: Record<string, unknown>, execution: AgentExecutionContext) {
    const focus = params.focus === "spaces" || params.focus === "assigned" ? params.focus : "all";
    const [actorOverview, requesterSpaces] = await Promise.all([
      loadActorWorkOverview(execution.actor.id),
      execution.requester.id === execution.actor.id
        ? Promise.resolve(null)
        : listWorkTaskSpaces(execution.requester.id),
    ]);
    const spaces = requesterSpaces
      ? intersectWorkSpaces(actorOverview.spaces, requesterSpaces.spaces)
      : actorOverview.spaces;
    const sharedKeys = new Set(spaces.map(spaceKey));
    const assigned = actorOverview.assigned
      .filter((group) => sharedKeys.has(spaceKey(group.plan)))
      .slice(0, 20);
    const modelContext = {
      actor: {
        userId: execution.actor.id,
        displayName: execution.actor.employeeName
          || (execution.actor.employeeId ? `员工 ${execution.actor.employeeId}` : "未绑定员工"),
      },
      spaces: focus === "assigned" ? [] : spaces.map(toModelSpace),
      assigned: focus === "spaces" ? [] : assigned,
      scopeRule: execution.requester.id === execution.actor.id
        ? "返回当前用户经 Work scoped permission 过滤后的空间。"
        : "仅返回请求人与执行身份都具备 scoped read 的 Work 空间。",
    };

    return {
      type: spaces.length || assigned.length ? "data" : "empty",
      message: spaces.length || assigned.length
        ? `已读取 ${spaces.length} 个共同可见工作空间和 ${assigned.length} 组被分配事项。`
        : "当前没有可读取的 Work 工作空间或被分配事项。",
      data: {
        ...modelContext,
        presentation: {
          kind: "resource-set",
          items: spaces.slice(0, 12).map((space) => ({
            key: spaceKey(space),
            title: space.name,
            subtitle: space.subtitle || workSpaceTypeLabel(space.targetType),
            meta: `${space.counts.objective} 目标 · ${space.counts.task} 任务`,
            openHref: workSpaceHref(space),
          })),
        },
      },
      modelContext,
    };
  },
};

async function loadActorWorkOverview(userId: number) {
  const [spaceResult, departmentGroups, personalGroups] = await Promise.all([
    listWorkTaskSpaces(userId),
    listAssignedDepartmentWorkPlanGroups(userId),
    listAssignedPersonalCollaborationWorkPlanGroups(userId),
  ]);
  const assigned = [...departmentGroups, ...personalGroups].map((group) => ({
    plan: {
      id: group.plan.id,
      title: group.plan.title,
      targetType: group.plan.targetType,
      targetId: group.plan.targetId,
      cycle: group.plan.okrCycleLabel,
    },
    source: group.assignerSpaceName || group.arrangerEmployeeName || "Work",
    items: group.assignedWorks.slice(0, 12).map((item) => ({
      id: item.id,
      type: item.itemType,
      title: item.content,
      status: item.status,
      plannedEndDate: item.plannedEndDate,
      actualEndDate: item.actualEndDate,
      project: item.linkedProjectName,
    })),
  }));
  return { spaces: spaceResult.spaces, assigned };
}

function toModelSpace(space: SharedWorkSpace | WorkTaskSpace) {
  return {
    targetType: space.targetType,
    targetId: space.targetId,
    name: space.name,
    subtitle: space.subtitle,
    lifecycleStatus: space.lifecycleStatus,
    counts: space.counts,
    allowedActions: Object.entries(space.actionPermissions)
      .filter(([, allowed]) => allowed)
      .map(([action]) => action),
    openHref: workSpaceHref(space),
  };
}

function spaceKey(space: { targetType: string; targetId: number }) {
  return `${space.targetType}:${space.targetId}`;
}

function workSpaceHref(space: { targetType: string; targetId: number }) {
  if (space.targetType === "department") return `/work/department/${space.targetId}/space`;
  if (space.targetType === "project") return `/work/project/${space.targetId}/space`;
  return "/work/me";
}

function workSpaceTypeLabel(targetType: string) {
  if (targetType === "department") return "部门空间";
  if (targetType === "project") return "项目空间";
  return "个人空间";
}

export const workAgentTools: AgentTool[] = [getMyWorkOverviewTool, ...workItemAgentTools];
