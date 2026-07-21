/**
 * Workspace Agent policy boundary.
 * The selected runtime owns the model loop; Platform still owns identity, RBAC and concurrency.
 */
import { resolveAgentToolAccess } from "./capabilities";
import {
  normalizeAgentExecutionContext,
  type AgentExecutionPrincipal,
} from "./execution";
import { isAgentIdentityQuestion } from "./identity-context";
import type { AgentInputImage, AgentResponse, AgentRuntime, HistoryMessage } from "./runtime/contracts";
import { defaultAgentRuntime } from "./runtime/default-runtime";
import { runWithAgentTurnLimit } from "./runtime/turn-limiter";
import type { AgentTool } from "./tools";

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
  onTextDelta?: (delta: string) => void;
  runtime?: AgentRuntime;
  /** Internal seam for deterministic tests; production uses the Platform resolver. */
  resolveToolAccess?: typeof resolveAgentToolAccess;
};

function shouldRefuseSecurityQuestion(message: string) {
  const isMetaPolicyQuestion = SECURITY_META_PATTERNS.some((pattern) => pattern.test(message));
  const hasAbuseDetail = SECURITY_ABUSE_PATTERNS.some((pattern) => pattern.test(message));
  if (isMetaPolicyQuestion && !hasAbuseDetail) return false;
  return SECURITY_QUESTION_PATTERNS.some((pattern) => pattern.test(message));
}

export async function processMessage(
  userMessage: string,
  principal: AgentExecutionPrincipal,
  tools: AgentTool[],
  history: HistoryMessage[] = [],
  options: ProcessMessageOptions = {},
): Promise<AgentResponse> {
  const execution = normalizeAgentExecutionContext(principal);
  if (options.identityAnswer && isAgentIdentityQuestion(userMessage)) {
    return { type: "answer", message: options.identityAnswer };
  }
  if (shouldRefuseSecurityQuestion(userMessage)) {
    return { type: "answer", message: SECURITY_REFUSAL_MESSAGE };
  }

  const access = await (options.resolveToolAccess ?? resolveAgentToolAccess)(execution, tools);
  if (access.tools.length === 0) {
    return {
      type: "answer",
      message: "你当前没有可用功能。如需帮助，请联系管理员开通相应权限。",
    };
  }

  const runtime = options.runtime ?? defaultAgentRuntime;
  return runWithAgentTurnLimit(options.signal, () => runtime.runTurn({
    message: userMessage,
    execution: access.execution ?? execution,
    tools: access.tools,
    history,
    images: options.images ?? [],
    identityContext: options.identityContext,
    onTextDelta: options.onTextDelta,
    signal: options.signal,
  }));
}

export type { AgentResponse } from "./runtime/contracts";
