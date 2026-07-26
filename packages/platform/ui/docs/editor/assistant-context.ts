import type { PageAssistantOpenInput } from "@workspace/core/ui";

import type { EditorTemplateDetailDto } from "./api";

const templateStatusLabels: Record<EditorTemplateDetailDto["status"], string> = {
  archived: "已归档",
  draft: "草稿",
  published: "已发布",
};

export function buildDocsEditorAssistantContext(input: {
  activeSpaceTitle?: string | null;
  activeTab: string;
  activeTemplateId?: string | null;
  detail?: EditorTemplateDetailDto | null;
}): Pick<PageAssistantOpenInput, "contextLabel" | "sourceContext"> {
  const detail = input.activeTab === "templates" && input.detail?.id === input.activeTemplateId
    ? input.detail
    : null;
  return {
    contextLabel: [
      "文档模板",
      input.activeSpaceTitle,
      detail ? `当前模板：${detail.title}` : null,
    ].filter(Boolean).join(" / "),
    sourceContext: {
      navigationLabel: "文档模板",
      activeKey: input.activeTab,
      activeLabel: input.activeTab === "workflow" ? "待处理" : "文档模板",
      ...(detail ? {
        activeChildKey: `template:${detail.id};version:${detail.version};status:${detail.status}`,
        activeChildLabel: `${detail.title}（${templateStatusLabels[detail.status]}）`,
      } : {}),
    },
  };
}
