import type { SessionUser } from "@workspace/platform/types";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";
import { AgentConversationSurface } from "@workspace/platform/ui/AgentConversationSurface";

export function AgentHomePage({ user }: { user: SessionUser }) {
  const enabled = user.visibleSubmitResourceKeys?.includes("agent.assistant") ?? false;
  return renderAppShellPage({
    title: "智能体",
    backHref: "/portal",
    user,
    children: (
      <AgentConversationSurface
        open
        enabled={enabled}
        variant="workspace"
        title="Workspace Agent"
        emptyTitle="今天，想处理什么？"
        emptyDescription="我会在你的权限范围内读取业务资料；任何写入都会先生成待确认提案。"
        disabledMessage="当前账号尚未开通 Agent 助手调用权限。"
        context={{ path: "/agent", title: "智能体", contextLabel: "Workspace Agent" }}
      />
    ),
  });
}
