import { workspacePath } from "@workspace/core/routing";
import { ModuleCard, ModuleGridPage } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import { AgentConversationSurface, type AgentConversationStarter } from "@workspace/platform/ui";

const workHomeIcons = {
  project: (
    <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5h6M9 9h6M9 13h3m-7 8h14a2 2 0 002-2V7.5a2 2 0 00-.586-1.414l-3.5-3.5A2 2 0 0015.5 2H5a2 2 0 00-2 2v15a2 2 0 002 2z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 2v4a2 2 0 002 2h4M15 17l2 2 4-5" />
    </svg>
  ),
  work: (
    <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />
    </svg>
  ),
};

export function WorkHomePageView({
  user,
  canEnterDepartmentHome,
}: {
  user: SessionUser;
  canEnterDepartmentHome?: boolean;
}) {
  const agentEnabled = user.visibleSubmitResourceKeys?.includes("agent.assistant") ?? false;
  const starters = workAgentStarters(user, Boolean(canEnterDepartmentHome));

  return (
    <AgentConversationSurface
      open
      enabled={agentEnabled}
      variant="workspace"
      title="Work Agent"
      emptyTitle="今天，想推进什么？"
      emptyDescription="我会先读取你有权限的工作空间、目标和绩效材料，再给出可追溯的结果；任何写入都需要你确认。"
      disabledMessage="当前账号可以继续进入原有 Work 模块，但尚未开通 Agent 助手调用权限。"
      showAgentProfileSelector={false}
      context={{
        path: "/work",
        title: "Work Agent",
        contextLabel: "Work 智能工作台",
        sourceContext: { navigationLabel: "Work", activeKey: "agent", activeLabel: "Agent 试点" },
      }}
      starters={starters}
    />
  );
}

function workAgentStarters(user: SessionUser, canEnterDepartmentHome: boolean): AgentConversationStarter[] {
  const starters: AgentConversationStarter[] = [];
  if (canEnter(user, "work.tasks")) {
    starters.push(
      {
        key: "maintain-work-item",
        label: "维护已有工作项",
        description: "通过问答定位目标、KR 或任务，核对表单后再确认写入",
        prompt: "请帮我维护一个已有 Work 工作项。先读取我有权限的空间、计划和节点；空间、计划、目标节点或字段有缺失或歧义时逐项询问，不要猜 ID。根据我的反馈整理完整变更，最后只生成待确认提案，由我确认后再写入。",
      },
      {
        key: "work-overview",
        label: "梳理我的重点事项",
        description: "汇总我当前参与的空间、计划和待推进工作",
        prompt: "请读取我有权限的 Work 工作空间，梳理当前重点事项、临近计划和需要我推进的工作，并标明信息来源。",
      },
      {
        key: "weekly-summary",
        label: "整理本周工作",
        description: "根据目标、任务和已完成事项生成周度总结",
        prompt: "请结合我有权限的 Work 目标、任务和完成事实，整理本周工作总结；缺少周期或事实时先向我确认，不要编造。",
      },
    );
  }
  if (canEnter(user, "work.tasks") && canEnter(user, "hr.performance")) {
    starters.push({
      key: "performance",
      label: "填写本期绩效",
      description: "先汇总 Work 证据，再起草本人绩效自评",
      prompt: "请读取我的当前绩效周期和 Work 贡献材料，先按事实来源整理本人绩效自评草稿；不要直接提交，先让我检查。",
    });
  }
  if (canEnter(user, "work.projects")) {
    starters.push({
      key: "projects",
      label: "检查项目进展",
      description: "查看我可见的项目空间和执行事项",
      prompt: "请读取我有权限的项目与项目工作空间，概括当前项目进展、风险和需要我跟进的事项。",
    });
  }
  starters.push(...workModuleLinks(user, canEnterDepartmentHome));
  return starters;
}

function workModuleLinks(user: SessionUser, canEnterDepartmentHome: boolean): AgentConversationStarter[] {
  return [
    ...(canEnter(user, "work.tasks") ? [{ key: "open-workspace", label: "工作空间", description: "查看完整计划、目标、汇报和周期流程", href: "/work/me" }] : []),
    ...(canEnter(user, "work.tasks") && canEnterDepartmentHome ? [{ key: "open-department", label: "部门主页", description: "查看部门总览和部门空间", href: "/work/department" }] : []),
    ...(canEnter(user, "work.projects") ? [{ key: "open-project", label: "项目管理", description: "维护项目资料、成员与项目空间", href: "/work/project" }] : []),
    ...(canEnter(user, "work.meetings") ? [{ key: "open-meeting", label: "会议管理", description: "查看会议、纪要、表决和决议", href: "/work/meeting" }] : []),
    ...(canEnter(user, "work.tasks") && canEnter(user, "hr.performance") ? [{ key: "open-performance", label: "绩效评审", description: "查看本人绩效材料与流程状态", href: "/work/performance" }] : []),
  ];
}

export function WorkDepartmentEntryFallback({ message }: { message: string }) {
  return (
    <ModuleGridPage title="部门空间" summary={message} gridClassName="lg:grid-cols-2">
      <ModuleCard
        title="工作空间"
        description="返回工作空间"
        icon={workHomeIcons.work}
        color="emerald"
        href={workspacePath("/work/me")}
      />
      <ModuleCard
        title="工作管理"
        description="返回工作入口"
        icon={workHomeIcons.work}
        color="emerald"
        href={workspacePath("/work")}
      />
    </ModuleGridPage>
  );
}

export function WorkProjectWorkspaceFallback({ message }: { message: string }) {
  return (
    <ModuleGridPage title="项目空间" summary={message} gridClassName="lg:grid-cols-2">
      <ModuleCard
        title="项目管理"
        description="返回项目总览维护项目资料"
        icon={workHomeIcons.project}
        color="emerald"
        href={workspacePath("/work/project")}
      />
      <ModuleCard
        title="工作空间"
        description="返回工作空间"
        icon={workHomeIcons.work}
        color="emerald"
        href={workspacePath("/work/me")}
      />
    </ModuleGridPage>
  );
}

function canEnter(user: SessionUser, resourceKey: string) {
  return Boolean(user.isSuperAdmin || user.visibleResourceKeys?.includes(resourceKey));
}
