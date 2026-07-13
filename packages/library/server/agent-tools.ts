import type { AgentTool } from "@workspace/platform/server/agent";

import {
  createLibraryAgentDelivery,
  DIRECT_LIBRARY_FILE_LIMIT,
  planLibraryAgentDelivery,
  type LibraryAgentDeliveryReadyData,
} from "./agent-delivery";
import { checkLibraryExport } from "./permissions";
import { searchLibraryDocumentSet } from "./search";
import { buildLibrarySearchModelContext } from "./search-relevance";

export const searchLibraryTool: AgentTool = {
  key: "library.searchDocuments",
  label: "检索资料库",
  description: "按当前用户权限检索资料库并回答内容问题，引用 evidence 原文和 locator。用户明确要求发送原始资料或资料包时，不要用本工具代替发送判断，应先调用 library.planDelivery。",
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

export const planLibraryDeliveryTool: AgentTool = {
  key: "library.planDelivery",
  label: "规划资料发送",
  description: "用户要求发送资料时必须先调用。返回经过权限和主题相关性收窄的编号候选清单。你必须真正判断发送范围：只有唯一明确命中，或用户已经明确说全部发送、指定编号、确认上一轮清单时，才能继续调用 library.deliverDocuments；多候选且用户未明确范围时，列出编号、标题和资料编号并向用户确认，不得调用发送工具。",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "要发送资料的完整业务主题；确认上一轮清单时沿用上一轮主题" },
    },
    required: ["query"],
    additionalProperties: false,
  },
  requiredPermissions: [{ resourceKey: "library.basicInfo", action: "export" }],
  mutates: false,
  async execute(params, user) {
    const query = typeof params.query === "string" ? params.query : "";
    try {
      const plan = await planLibraryAgentDelivery({ query, userId: user.id });
      if (plan.status === "denied") return { type: "error", message: "当前账号没有资料导出权限。" };
      if (plan.status === "empty") return { type: "empty", message: plan.message };
      const data = {
        kind: "library-delivery-plan-v1" as const,
        query: plan.query,
        directFileLimit: DIRECT_LIBRARY_FILE_LIMIT,
        documents: plan.documents.map((document) => ({
          index: document.index,
          title: document.title,
          docId: document.docId,
          versionUid: document.versionUid,
        })),
        decisionRule: "多候选且用户未明确全部或编号时，向用户确认；不要自动发送。",
      };
      return {
        type: "data",
        message: `已规划“${plan.query}”的 ${plan.documents.length} 份候选资料，请判断是否需要用户确认。`,
        data,
        modelContext: data,
      };
    } catch (error) {
      return { type: "error", message: error instanceof Error ? error.message : "资料发送规划失败" };
    }
  },
};

export const deliverLibraryDocumentsTool: AgentTool = {
  key: "library.deliverDocuments",
  label: "发送资料",
  description: `发送用户已明确选择的资料。调用前必须先调用 library.planDelivery 取得当前候选 versionUid；多候选时，只有用户明确要求全部、指定编号或确认上一轮清单才可调用。不要替用户猜测范围。选择超过 ${DIRECT_LIBRARY_FILE_LIMIT} 份时服务会自动生成 ZIP，否则逐个发送原文件。`,
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "与规划工具相同的完整业务主题" },
      versionUids: {
        type: "array",
        minItems: 1,
        maxItems: 20,
        items: { type: "string" },
        description: "用户已明确选择、且来自本轮规划候选清单的 versionUid",
      },
    },
    required: ["query", "versionUids"],
    additionalProperties: false,
  },
  requiredPermissions: [{ resourceKey: "library.basicInfo", action: "export" }],
  // Export creates only a short-lived requester-owned delivery artifact, not a business-data mutation.
  mutates: false,
  async execute(params, user) {
    const query = typeof params.query === "string" ? params.query : "";
    const versionUids = Array.isArray(params.versionUids)
      ? params.versionUids.filter((value): value is string => typeof value === "string")
      : [];
    try {
      const delivery = await createLibraryAgentDelivery({ query, versionUids, userId: user.id });
      if (delivery.status === "denied") return { type: "error", message: "当前账号没有资料导出权限。" };
      if (delivery.status === "empty") return { type: "empty", message: delivery.message };
      const data: LibraryAgentDeliveryReadyData = {
        kind: "library-delivery-ready-v1",
        mode: delivery.mode,
        query: delivery.query,
        artifacts: delivery.artifacts,
      };
      return {
        type: "data",
        message: delivery.mode === "files"
          ? `已准备发送 ${delivery.artifacts.length} 份“${delivery.query}”资料。`
          : `已准备“${delivery.query}”资料压缩包。`,
        data,
        modelContext: {
          kind: data.kind,
          mode: data.mode,
          query: data.query,
          itemCount: data.artifacts.reduce((sum, artifact) => sum + artifact.itemCount, 0),
        },
      };
    } catch (error) {
      return { type: "error", message: error instanceof Error ? error.message : "资料发送失败" };
    }
  },
};

export const libraryAgentTools: AgentTool[] = [searchLibraryTool];
export const libraryWecomAgentTools: AgentTool[] = [searchLibraryTool, planLibraryDeliveryTool, deliverLibraryDocumentsTool];
