/**
 * Agent 编排器。
 * 接收用户输入 → 意图分类 → 选择工具 → 权限二次校验 → 执行 → 总结 → 返回结果。
 */
import type { SessionUser } from "@workspace/platform/types";

import { findTool, resolveAgentToolAccess } from "./capabilities";
import { isAgentIdentityQuestion } from "./identity-context";
import {
  projectAgentToolResult,
  serializeAgentModelContext,
  type AgentToolModelProjection,
} from "./model-context";
import { defaultAgentModelProvider } from "./model/default";
import { noopProvider } from "./model/noop";
import type {
  AgentInputImage,
  AgentMessageContentPart,
  AgentModelProvider,
  AgentModelToolCallPayload,
  AgentToolCall,
  AgentToolCallMessage,
  HistoryMessage,
  IntentResult,
} from "./model/provider";
import { buildClassifyPrompt, buildSummarizePrompt } from "./prompts";
import { fitAgentToolCallMessages } from "./tool-call-context";
import { agentToolCallRounds } from "./tool-loop-policy";
import type { AgentTool, AgentToolParameters, AgentToolResult } from "./tools";

export interface AgentResponse {
  type: "answer" | "error" | "clarification" | "proposal";
  message: string;
  toolUsed?: string;
  data?: unknown;
  proposal?: {
    id: number;
    actionKey: string;
    targetType: string;
    targetId?: string;
    diff: Record<string, unknown>;
  };
}

const SECURITY_REFUSAL_MESSAGE = "我不能回答漏洞利用、绕权、攻击路径、PoC、扫描、弱口令、敏感凭据或密钥相关问题。可以解释正常权限模型、代码结构、审计思路和合规修复方向。";

const SECURITY_QUESTION_PATTERNS = [
  /漏洞|vulnerability|cve|exploit|poc|payload/i,
  /攻击|渗透|扫描漏洞|弱口令|脱库|后门/i,
  /sql\s*注入|注入|xss|csrf|rce|ssrf|xxe/i,
  /越权|绕权|提权|权限绕过|拿权限/i,
  /敏感信息泄露|密钥|api\s*key|apikey|secret|token/i,
];
const SECURITY_META_PATTERNS = [
  /漏洞.*(拒答|拒绝|屏蔽|禁止|拦截|策略|规则)/i,
  /(拒答|拒绝|屏蔽|禁止|拦截).*漏洞/i,
  /安全策略|合规修复方向|正常权限模型/i,
];
const SECURITY_ABUSE_PATTERNS = [
  /exploit|poc|payload/i,
  /攻击|渗透|扫描|弱口令|脱库|后门|利用/i,
  /注入|xss|csrf|rce|ssrf|xxe/i,
  /越权|绕权|提权|权限绕过|拿权限/i,
  /密钥|api\s*key|apikey|secret|token/i,
];

export type ProcessMessageOptions = {
  images?: AgentInputImage[];
  signal?: AbortSignal;
  identityContext?: string;
  identityAnswer?: string;
  /** Internal seam for deterministic tests; production uses the Platform resolver. */
  resolveToolAccess?: typeof resolveAgentToolAccess;
};

type RuntimeTool = {
  tool: AgentTool;
  functionName: string;
};

export async function processMessage(
  userMessage: string,
  user: SessionUser,
  tools: AgentTool[],
  history?: HistoryMessage[],
  provider: AgentModelProvider = defaultAgentModelProvider,
  options: ProcessMessageOptions = {},
): Promise<AgentResponse> {
  if (options.identityAnswer && isAgentIdentityQuestion(userMessage)) {
    return { type: "answer", message: options.identityAnswer };
  }
  const access = await (options.resolveToolAccess ?? resolveAgentToolAccess)(user, tools);
  const { capabilities, tools: allowedTools } = access;

  if (capabilities.length === 0) {
    return {
      type: "answer",
      message: "你当前没有可用功能。如需帮助，请联系管理员开通相应权限。",
    };
  }

  if (shouldRefuseSecurityQuestion(userMessage)) {
    return { type: "answer", message: SECURITY_REFUSAL_MESSAGE };
  }

  if (provider.callWithTools) {
    try {
      return await processWithToolCalls(userMessage, user, allowedTools, history, provider, options);
    } catch (err) {
      if (isAbortError(err) || options.signal?.aborted) throw err;
      if (options.images?.length) throw err;
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[agent] LLM callWithTools failed, falling back to classify flow:", message);
    }
  }

  const capList = capabilities.map((c) => ({ key: c.key, label: c.label, description: c.description }));
  const classifyPrompt = buildClassifyPrompt(capList, options.identityContext);

  // 1. 意图分类（优先 LLM，失败回退规则匹配）
  let intent: IntentResult;
  try {
    intent = await provider.classifyIntent(userMessage, classifyPrompt, history, options.signal);
  } catch (err) {
    if (isAbortError(err) || options.signal?.aborted) throw err;
    console.warn("[agent] LLM classifyIntent failed, falling back to noop provider");
    intent = await noopProvider.classifyIntent(userMessage, classifyPrompt, history);
  }

  // 上下文中已有答案，直接返回
  if (intent.directAnswer) {
    return { type: "answer", message: intent.directAnswer };
  }

  // 需要澄清
  if (!intent.tool || intent.confidence < 0.5) {
    return {
      type: "clarification",
      message: intent.clarification || "抱歉，我没理解你的意思，能换个说法吗？",
    };
  }

  // 2. 查找工具
  const tool = findTool(intent.tool, allowedTools);
  if (!tool) {
    return {
      type: "error",
      message: `工具 ${intent.tool} 不可用（权限不足或不存在）`,
    };
  }

  // 3. 执行工具（内部有二次权限校验）
  const result = await tool.execute(intent.params, user);

  // proposal 直接返回，不经过 LLM 总结
  if (result.type === "proposal" && result.proposal) {
    return {
      type: "proposal",
      message: result.message,
      toolUsed: tool.key,
      proposal: result.proposal,
    };
  }

  // 4. 用 LLM 总结为对话语言（失败则用规则总结）
  let summary: string;
  try {
    summary = await provider.summarizeResult({
      toolLabel: tool.label,
      query: userMessage,
      result: projectAgentToolResult(result),
      history,
    }, buildSummarizePrompt(), options.signal);
  } catch (err) {
    if (isAbortError(err) || options.signal?.aborted) throw err;
    summary = await noopProvider.summarizeResult({
      toolLabel: tool.label,
      query: userMessage,
      result: projectAgentToolResult(result),
    }, buildSummarizePrompt());
  }

  return {
    type: "answer",
    message: summary,
    toolUsed: tool.key,
    data: result.data,
  };
}

async function processWithToolCalls(
  userMessage: string,
  user: SessionUser,
  allowedTools: AgentTool[],
  history: HistoryMessage[] | undefined,
  provider: AgentModelProvider,
  options: ProcessMessageOptions,
): Promise<AgentResponse> {
  const runtimeTools = buildRuntimeTools(allowedTools);
  const runtimeByFunction = new Map(runtimeTools.map((runtime) => [runtime.functionName, runtime]));
  const modelTools = runtimeTools.map((runtime) => ({
    name: runtime.functionName,
    description: runtime.tool.description,
    parameters: runtime.tool.parameters ?? defaultToolParameters(),
  }));
  const messages: AgentToolCallMessage[] = [
    { role: "system", content: buildToolCallSystemPrompt(runtimeTools, options.identityContext) },
  ];
  appendHistory(messages, history);

  let lastToolUsed: string | undefined;
  let lastData: unknown;
  let lastModelResult: AgentToolModelProjection | undefined;

  if (requiresSourceRead(userMessage)) {
    const preload = await preloadSourceContext(userMessage, user, runtimeTools, messages);
    if (preload) {
      lastToolUsed = preload.toolUsed;
      lastData = preload.data;
      lastModelResult = preload.modelResult;
    }
  }

  messages.push({ role: "user", content: buildUserContent(userMessage, options.images) });

  for (const _round of agentToolCallRounds()) {
    const result = await provider.callWithTools?.({
      messages: fitAgentToolCallMessages(messages, modelTools),
      tools: modelTools,
      signal: options.signal,
    });

    if (!result) break;

    if (result.toolCalls.length === 0) {
      return {
        type: "answer",
        message: result.content.trim() || "我已读取上下文，但还需要你补充一下具体想问哪一块。",
        toolUsed: lastToolUsed,
        data: lastData,
      };
    }

    messages.push({
      role: "assistant",
      content: result.content || null,
      tool_calls: result.toolCalls.map(toToolCallPayload),
    });

    for (const toolCall of result.toolCalls) {
      const runtime = runtimeByFunction.get(toolCall.name);
      if (!runtime) {
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          name: toolCall.name,
          content: serializeAgentModelContext({ type: "error", message: `工具 ${toolCall.name} 不存在或不可用。` }),
        });
        continue;
      }

      const toolResult = await executeRuntimeTool(runtime, toolCall, user);
      if (toolResult.type === "proposal" && toolResult.proposal) {
        return {
          type: "proposal",
          message: toolResult.message,
          toolUsed: runtime.tool.key,
          proposal: toolResult.proposal,
        };
      }

      lastToolUsed = runtime.tool.key;
      lastData = toolResult.data;
      lastModelResult = projectAgentToolResult(toolResult);
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        name: toolCall.name,
        content: compactToolResult(toolResult),
      });
    }
  }

  return {
    type: "answer",
    message: await summarizeAfterToolLoop(userMessage, history, provider, options.signal, lastToolUsed, lastModelResult),
    toolUsed: lastToolUsed,
    data: lastData,
  };
}

function buildUserContent(message: string, images?: AgentInputImage[]): string | AgentMessageContentPart[] {
  if (!images?.length) return message;
  return [
    ...images.map((image) => ({
      type: "image_url" as const,
      image_url: { url: image.dataUrl },
    })),
    {
      type: "text" as const,
      text: message,
    },
  ];
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function shouldRefuseSecurityQuestion(message: string) {
  const isMetaPolicyQuestion = SECURITY_META_PATTERNS.some((pattern) => pattern.test(message));
  const hasAbuseDetail = SECURITY_ABUSE_PATTERNS.some((pattern) => pattern.test(message));
  if (isMetaPolicyQuestion && !hasAbuseDetail) return false;
  return SECURITY_QUESTION_PATTERNS.some((pattern) => pattern.test(message));
}

function requiresSourceRead(message: string) {
  return /源码|代码|架构|实现|怎么做|怎么接|cnb|github|仓库|resourceKey|resource|rbac|api|路由|route|registry|module-registry|agents?\.md|docs|页面|入口|pr|pull request/i.test(message);
}

function buildRuntimeTools(tools: AgentTool[]): RuntimeTool[] {
  const usedNames = new Set<string>();
  return tools.map((tool) => {
    const base = toFunctionName(tool.key);
    let functionName = base;
    let index = 2;
    while (usedNames.has(functionName)) {
      functionName = `${base}_${index}`;
      index += 1;
    }
    usedNames.add(functionName);
    return { tool, functionName };
  });
}

function toFunctionName(key: string) {
  const normalized = key.replace(/[^a-zA-Z0-9_-]/g, "_");
  const withValidPrefix = /^[a-zA-Z_]/.test(normalized) ? normalized : `tool_${normalized}`;
  return withValidPrefix.slice(0, 64);
}

function defaultToolParameters(): AgentToolParameters {
  return {
    type: "object",
    properties: {
      query: { type: "string", description: "用户问题或查询关键词" },
    },
    additionalProperties: true,
  };
}

function appendHistory(messages: AgentToolCallMessage[], history?: HistoryMessage[]) {
  if (!history || history.length === 0) return;
  for (const h of history) {
    messages.push({
      role: h.role === "agent" ? "assistant" : "user",
      content: h.content,
    });
  }
}

function buildToolCallSystemPrompt(runtimeTools: RuntimeTool[], identityContext?: string) {
  const toolList = runtimeTools
    .map((runtime) => `- ${runtime.functionName}: ${runtime.tool.label} — ${runtime.tool.description}${runtime.tool.mutates ? "（写入类，只能返回 proposal）" : ""}`)
    .join("\n");
  const examples = runtimeTools
    .flatMap((runtime) => (runtime.tool.examples || []).map((example) => {
      return `用户：${example.user}\n工具调用：${runtime.functionName}(${JSON.stringify(example.arguments)})`;
    }))
    .join("\n\n");

  return `你是内部管理系统的小助手，必须严格按当前用户权限使用工具。

${identityContext || "当前已认证用户没有绑定员工或企业微信身份信息；不得猜测。"}

可用工具：
${toolList}

硬规则：
1. 用户问源码、架构、页面/API/RBAC/资源、CNB/GitHub、代码路径或 PR 方案时，必须先使用源码上下文；源码工具会强制读取 AGENTS.md、docs/README.md、docs/engineering/project-overview.md、docs/engineering/agent-startup.md，并按问题路由到 docs/roles/*.md。若 system 消息已提供“源码预读结果”，这一步视为已完成；只有信息不足时才继续调用源码工具。没有源码依据时不要猜。
2. 你只能读取已配置的只读源码和当前用户已有权限的数据工具结果；不要要求、推测或读取服务器运行数据、数据库直连数据、密钥、token、环境变量。
3. 一切漏洞利用、绕权、攻击路径、PoC、扫描、弱口令、敏感凭据或密钥问题必须拒答；可以转为解释正常权限模型、审计方向和合规修复原则。
4. 涉及修改时，只能给出 proposal 或 PR 草案；不要声称已经提交、创建分支、打开远端 PR 或部署。PR 草案必须等待 Codex 审核。
5. 如果调用 PR 草案工具，必须提供能被 git apply 应用的 unified diff patch；不要只给标题、摘要或文件清单。
6. PR 草案里的验证项只能使用项目中已有且适用的命令；Markdown 文档不要建议 eslint，优先使用 npm run docs:check、已有 check:* 脚本或人工核对点。
7. 回答要引用你看到的公开源码路径或文档路径；不编造业务规则。
8. 用户问“我是谁/我的工号/我的企业微信身份”时，必须按上面的已认证身份逐字回答；身份信息只用于指代解析，不能替代 RBAC 或工具权限。
9. HR 员工搜索结果中的姓名和工号已经过当前用户的 hr.roster.read 权限校验，必须逐字显示，不得自行改成“张**”等掩码。

Few-shot 示例：
${examples || "（无）"}`;
}

async function preloadSourceContext(
  userMessage: string,
  user: SessionUser,
  runtimeTools: RuntimeTool[],
  messages: AgentToolCallMessage[],
) {
  const sourceRuntime = runtimeTools.find((runtime) => runtime.tool.key === "source.searchWorkspaceCode");
  if (!sourceRuntime) return null;
  const result = await executeRuntimeTool(sourceRuntime, {
    id: "preload_source_context",
    name: sourceRuntime.functionName,
    arguments: { query: userMessage },
  }, user);
  messages.push({
    role: "system",
    content: `源码预读结果（回答前必须考虑；其中 startupContext 来自 AGENTS.md 与路由后的 docs）：\n${compactToolResult(result)}`,
  });
  return {
    toolUsed: sourceRuntime.tool.key,
    data: result.data,
    modelResult: projectAgentToolResult(result),
  };
}

async function executeRuntimeTool(runtime: RuntimeTool, call: AgentToolCall, user: SessionUser): Promise<AgentToolResult> {
  try {
    return await runtime.tool.execute(call.arguments, user);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      type: "error",
      message: `工具执行失败：${message}`,
    };
  }
}

function toToolCallPayload(call: AgentToolCall): AgentModelToolCallPayload {
  return {
    id: call.id,
    type: "function",
    function: {
      name: call.name,
      arguments: JSON.stringify(call.arguments),
    },
  };
}

function compactToolResult(result: AgentToolResult) {
  return serializeAgentModelContext(projectAgentToolResult(result));
}

async function summarizeAfterToolLoop(
  userMessage: string,
  history: HistoryMessage[] | undefined,
  provider: AgentModelProvider,
  signal?: AbortSignal,
  lastToolUsed?: string,
  lastModelResult?: AgentToolModelProjection,
) {
  if (!lastToolUsed || typeof lastModelResult === "undefined") {
    return "我已读取相关上下文，但工具调用轮次过多。请把问题收窄到一个页面、API、权限点或 PR 目标。";
  }

  try {
    return await provider.summarizeResult({
      toolLabel: lastToolUsed,
      query: userMessage,
      result: lastModelResult,
      history,
    }, `${buildSummarizePrompt()}
- 如果 result 包含 startupContext/snippets，请基于这些源码和文档片段回答。
- 不要再要求调用工具；直接总结已有依据。`, signal);
  } catch {
    return "我已读取相关源码和启动文档，但模型没有在工具轮次内完成总结。请把问题收窄到一个页面、API、权限点或 PR 目标。";
  }
}
