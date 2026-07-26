import "server-only";

import { z } from "zod";

import {
  findApiContract,
  type ApiContract,
  type ApiMethod,
} from "@workspace/platform/api-registry";
import {
  readBoundedJsonResponse,
  workspaceInternalApiUrl,
} from "@workspace/platform/server/internal-unit-rpc";
import { buildPersonalApiCatalog } from "@workspace/platform/server/personal-api-catalog";

import { createAgentApiDelegationToken, AGENT_API_DELEGATION_HEADER } from "./api-delegation";
import { canAgentExecutionUseBusinessApi } from "./business-api-authorization";
import type { AgentExecutionContext } from "./execution";
import { createProposal, type ProposalExecutors } from "./proposals";
import { WORKSPACE_AGENT_CAPABILITY_KEYS } from "./runtime-binding";
import type { AgentTool, AgentToolResult } from "./tools";

const MAX_PATH_LENGTH = 2_048;
const MAX_REQUEST_BODY_BYTES = 256 * 1024;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;

export const AGENT_BUSINESS_API_MUTATION_ACTION = "agent.businessApi.mutation.execute";
export const AGENT_BUSINESS_API_TOOL_KEYS = WORKSPACE_AGENT_CAPABILITY_KEYS;

const CONNECTOR_PERMISSION = [{ resourceKey: "agent.assistant", action: "entry" }] as const;
const mutationMethodSchema = z.enum(["POST", "PUT", "PATCH", "DELETE"]);
const apiPathSchema = z.string().trim().min(1).max(MAX_PATH_LENGTH);
const readInputSchema = z.object({ path: apiPathSchema }).strict();
const mutationInputSchema = z.object({
  method: mutationMethodSchema,
  path: apiPathSchema,
  body: z.record(z.string(), z.unknown()).optional().default({}),
}).strict();
const discoveryInputSchema = z.object({
  query: z.string().trim().min(1).max(120),
}).strict();

type PreparedBusinessApiRequest = {
  method: ApiMethod;
  path: string;
  body: Record<string, unknown> | null;
  contract: ApiContract;
};

class AgentBusinessApiError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "AgentBusinessApiError";
  }
}

function normalizeBusinessApiTarget(method: ApiMethod, rawPath: string) {
  if (!rawPath.startsWith("/api/modules/") || rawPath.includes("\\") || rawPath.includes("#")) {
    throw new AgentBusinessApiError("Agent 只能调用 /api/modules/** 业务 API");
  }
  if (/%(?:2f|5c)/i.test(rawPath)) {
    throw new AgentBusinessApiError("API path 不允许编码的路径分隔符");
  }
  const rawPathname = rawPath.split("?", 1)[0];
  const url = new URL(rawPath, "http://workspace.invalid");
  if (url.origin !== "http://workspace.invalid" || url.pathname !== rawPathname || url.pathname.includes("//")) {
    throw new AgentBusinessApiError("API path 必须是规范的站内相对路径");
  }
  const contract = findApiContract(method, url.pathname, url.searchParams);
  if (
    !contract
    || contract.apiKind !== "business"
    || contract.access !== "protected"
    || !contract.pathPrefix.startsWith("/api/modules/")
  ) {
    throw new AgentBusinessApiError("该路径不是已注册且受保护的业务 API", 403);
  }
  return { path: `${url.pathname}${url.search}`, contract };
}

function prepareBusinessApiRequest(input: {
  method: ApiMethod;
  path: string;
  body?: Record<string, unknown> | null;
}): PreparedBusinessApiRequest {
  const target = normalizeBusinessApiTarget(input.method, input.path);
  const body = input.method === "GET" ? null : input.body ?? {};
  if (body) {
    const bytes = new TextEncoder().encode(JSON.stringify(body)).byteLength;
    if (bytes > MAX_REQUEST_BODY_BYTES) {
      throw new AgentBusinessApiError(`API 请求体超过 ${MAX_REQUEST_BODY_BYTES} 字节上限`, 413);
    }
  }
  return { method: input.method, path: target.path, body, contract: target.contract };
}

async function dispatchBusinessApiRequest(
  request: PreparedBusinessApiRequest,
  execution: AgentExecutionContext,
  markDispatchStarted?: () => void,
) {
  if (!(await canAgentExecutionUseBusinessApi(execution, request.contract))) {
    throw new AgentBusinessApiError("请求人或虚拟员工无权调用该业务 API", 403);
  }
  const serializedBody = request.body === null ? "" : JSON.stringify(request.body);
  const url = workspaceInternalApiUrl(request.path);
  const token = await createAgentApiDelegationToken({
    execution,
    method: request.method,
    target: request.path,
    body: serializedBody,
  });
  markDispatchStarted?.();
  const response = await fetch(url, {
    method: request.method,
    headers: {
      Accept: "application/json",
      ...(request.body === null ? {} : { "Content-Type": "application/json" }),
      [AGENT_API_DELEGATION_HEADER]: token,
    },
    ...(request.body === null ? {} : { body: serializedBody }),
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim() || null;
  let data: unknown = null;
  if (response.status !== 204 && contentType?.includes("json")) {
    data = await readBoundedJsonResponse(response, MAX_RESPONSE_BYTES);
    if (data === null) throw new AgentBusinessApiError("业务 API 返回了无效 JSON", 502);
  } else if (response.body) {
    await response.body.cancel().catch(() => undefined);
    data = {
      binary: response.ok,
      contentType,
      contentLength: response.headers.get("content-length"),
      downloadPath: response.ok ? request.path : undefined,
    };
  }
  if (!response.ok) {
    const error = data && typeof data === "object" && !Array.isArray(data)
      ? (data as { error?: unknown }).error
      : null;
    throw new AgentBusinessApiError(
      typeof error === "string" && error.trim()
        ? error.slice(0, 500)
        : `业务 API 请求失败（HTTP ${response.status}）`,
      response.status,
    );
  }
  return {
    request: { method: request.method, path: request.path },
    response: { status: response.status, contentType, data },
  };
}

function connectorError(error: unknown): AgentToolResult {
  return {
    type: "error",
    message: error instanceof Error ? error.message : "业务 API 调用失败",
  };
}

function searchApiCatalog(query: string) {
  const catalog = buildPersonalApiCatalog();
  const normalized = query.toLocaleLowerCase();
  const matches = (value: unknown) => normalized === "*"
    || JSON.stringify(value).toLocaleLowerCase().includes(normalized);
  return {
    version: catalog.version,
    authentication: catalog.authentication,
    rules: catalog.rules,
    contracts: catalog.contracts.filter(matches).slice(0, 30),
    mutations: catalog.mutations.filter(matches).slice(0, 30),
  };
}

const discoverBusinessApisTool: AgentTool = {
  key: AGENT_BUSINESS_API_TOOL_KEYS[0],
  label: "发现 Workspace 业务 API",
  description: "按业务词检索受保护的标准 API、workflow 和写动作。只返回 API contract，不读取源码、文件系统、Prisma 或内部 RPC。",
  parameters: {
    type: "object",
    properties: { query: { type: "string", description: "业务名称、资源、动作或 API path 关键词；* 表示浏览目录" } },
    required: ["query"],
    additionalProperties: false,
  },
  requiredPermissions: CONNECTOR_PERMISSION,
  policyActions: ["read"],
  delegatedExecution: true,
  mutates: false,
  async execute(params) {
    const parsed = discoveryInputSchema.safeParse(params);
    if (!parsed.success) return connectorError(new AgentBusinessApiError("API 目录查询参数无效"));
    const data = searchApiCatalog(parsed.data.query);
    return {
      type: data.contracts.length || data.mutations.length ? "data" : "empty",
      message: data.contracts.length || data.mutations.length
        ? "已返回匹配的标准业务 API。"
        : "没有匹配的标准业务 API。",
      data,
      modelContext: data,
    };
  },
};

const readBusinessApiTool: AgentTool = {
  key: AGENT_BUSINESS_API_TOOL_KEYS[1],
  label: "调用 Workspace 只读业务 API",
  description: "调用 API catalog 中已注册的 GET /api/modules/**。认证凭据由服务端注入，不能指定 host、header、Cookie、token 或文件路径。",
  parameters: {
    type: "object",
    properties: { path: { type: "string", description: "含 query string 的精确 /api/modules/** 路径" } },
    required: ["path"],
    additionalProperties: false,
  },
  requiredPermissions: CONNECTOR_PERMISSION,
  policyActions: ["read"],
  delegatedExecution: true,
  mutates: false,
  async execute(params, execution) {
    const parsed = readInputSchema.safeParse(params);
    if (!parsed.success) return connectorError(new AgentBusinessApiError("只读 API 参数无效"));
    try {
      const request = prepareBusinessApiRequest({ method: "GET", path: parsed.data.path });
      const data = await dispatchBusinessApiRequest(request, execution);
      return { type: "data", message: "业务 API 读取成功。", data, modelContext: data };
    } catch (error) {
      return connectorError(error);
    }
  },
};

const proposeBusinessApiMutationTool: AgentTool = {
  key: AGENT_BUSINESS_API_TOOL_KEYS[2],
  label: "提交 Workspace 业务 API 写入确认",
  description: "为已注册的 POST、PUT、PATCH 或 DELETE /api/modules/** 创建待确认请求。本工具不执行写入；用户确认后才用同一标准 API 执行。",
  parameters: {
    type: "object",
    properties: {
      method: { type: "string", enum: ["POST", "PUT", "PATCH", "DELETE"] },
      path: { type: "string", description: "含 query string 的精确 /api/modules/** 路径" },
      body: { type: "object", description: "API catalog/contract 声明的 JSON 请求体" },
    },
    required: ["method", "path", "body"],
    additionalProperties: false,
  },
  requiredPermissions: CONNECTOR_PERMISSION,
  policyActions: ["submit"],
  delegatedExecution: true,
  mutates: true,
  writeMode: "proposal",
  async execute(params, execution) {
    const parsed = mutationInputSchema.safeParse(params);
    if (!parsed.success) return connectorError(new AgentBusinessApiError("写入 API 参数无效"));
    try {
      const request = prepareBusinessApiRequest(parsed.data);
      if (!(await canAgentExecutionUseBusinessApi(execution, request.contract))) {
        throw new AgentBusinessApiError("请求人或虚拟员工无权调用该业务 API", 403);
      }
      const proposal = await createProposal(execution, {
        actionKey: AGENT_BUSINESS_API_MUTATION_ACTION,
        toolKey: AGENT_BUSINESS_API_TOOL_KEYS[2],
        targetType: "WorkspaceBusinessApi",
        targetId: `${request.method} ${request.path}`,
        payload: { method: request.method, path: request.path, body: request.body ?? {} },
        diff: { method: request.method, path: request.path, body: request.body ?? {} },
      });
      return {
        type: "proposal",
        message: proposal.message,
        proposal: {
          id: proposal.proposalId,
          actionKey: AGENT_BUSINESS_API_MUTATION_ACTION,
          targetType: "WorkspaceBusinessApi",
          targetId: `${request.method} ${request.path}`,
          diff: { method: request.method, path: request.path, body: request.body ?? {} },
        },
      };
    } catch (error) {
      return connectorError(error);
    }
  },
};

export const agentBusinessApiTools: AgentTool[] = [
  discoverBusinessApisTool,
  readBusinessApiTool,
  proposeBusinessApiMutationTool,
];

export function validateAgentBusinessApiMutationProposalPayload(payload: Record<string, unknown>) {
  const parsed = mutationInputSchema.safeParse(payload);
  if (!parsed.success) throw new AgentBusinessApiError("Agent 业务 API 提案载荷无效");
  return prepareBusinessApiRequest(parsed.data);
}

export async function executeAgentBusinessApiMutationProposal(
  payload: Record<string, unknown>,
  execution: AgentExecutionContext,
  markDispatchStarted: () => void,
) {
  const request = validateAgentBusinessApiMutationProposalPayload(payload);
  return dispatchBusinessApiRequest(request, execution, markDispatchStarted);
}

export const agentBusinessApiProposalExecutors: ProposalExecutors = {
  [AGENT_BUSINESS_API_MUTATION_ACTION]: {
    toolKey: AGENT_BUSINESS_API_TOOL_KEYS[2],
    requiredPermissions: CONNECTOR_PERMISSION,
    policyActions: ["submit"],
    delegatedExecution: true,
    failureMayHaveSideEffects: true,
    uncertainFailureBoundary: "external_dispatch",
    execute: (payload, execution, control) => executeAgentBusinessApiMutationProposal(
      payload,
      execution,
      () => control.markExternalDispatchStarted(),
    ),
  },
};
