import type { AgentTool } from "@workspace/platform/server/agent";

import { checkLibraryExport } from "./permissions";
import { searchLibraryDocumentSet } from "./search";
import { buildLibrarySearchModelContext } from "./search-relevance";

export const searchLibraryTool: AgentTool = {
  key: "library.searchDocuments",
  label: "检索资料库",
  description: "按当前用户权限检索资料库。回答问题时引用 evidence 的原文和 locator；用户索要原始资料或资料包时，保留返回的不可变 selection 供分类打包。",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "问题、主题、文件名、资料编号或关键词" },
      limit: { type: "integer", minimum: 1, maximum: 20, description: "最多返回的资料数" },
    },
    required: ["query"],
    additionalProperties: false,
  },
  examples: [
    { user: "关账制度里对完成时间有什么要求？", arguments: { query: "关账" } },
    { user: "把 Tenecton 相关原始资料整理给我", arguments: { query: "Tenecton", limit: 20 } },
  ],
  requiredPermissions: [{ resourceKey: "library.basicInfo", action: "read" }],
  mutates: false,

  async execute(params, user) {
    const query = typeof params.query === "string" ? params.query : "";
    const limit = typeof params.limit === "number" ? params.limit : undefined;
    try {
      const result = await searchLibraryDocumentSet({ query, limit, userId: user.id });
      const canExport = await checkLibraryExport(user.id);
      const data = {
        ...result,
        canExport,
        presentation: {
          kind: "resource-set" as const,
          items: result.documents.map((document) => ({
            key: document.versionUid,
            title: document.title,
            subtitle: document.docId,
            meta: document.categoryName || "未分类",
            openHref: `/library/basic-info/documents/${document.documentId}`,
            downloadHref: canExport
              ? `/api/modules/library/basic-info/documents/${document.documentId}/versions/${document.versionId}/download`
              : undefined,
          })),
          bundle: canExport && result.selection.length > 0 ? {
            label: result.selection.length === 1 ? "打包下载" : `打包下载（${result.selection.length} 份）`,
            createHref: "/api/modules/library/basic-info/exports",
            requestBody: { selection: result.selection, includePreviews: false },
            responseKey: "exportUid",
            downloadHrefTemplate: "/api/modules/library/basic-info/exports/{exportUid}/download",
          } : undefined,
        },
      };
      const modelContext = buildLibrarySearchModelContext(result);
      if (result.documents.length === 0) {
        return { type: "empty", message: `资料库中未找到“${query}”的可访问资料。`, data, modelContext };
      }
      return {
        type: "data",
        message: `找到 ${result.documents.length} 份可访问资料；其中 ${result.documents.filter((item) => item.evidence.length > 0).length} 份带正文证据。`,
        data,
        modelContext,
      };
    } catch (error) {
      return { type: "error", message: error instanceof Error ? error.message : "资料库检索失败" };
    }
  },
};

export const libraryAgentTools: AgentTool[] = [searchLibraryTool];
