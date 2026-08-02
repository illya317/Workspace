import {
  AgentRuntimeAbortError,
  type AgentRuntime,
  type AgentRuntimeInput,
} from "./contracts";
import { KimiAgentRuntime } from "./kimi-runtime";
import { PiDeepSeekAgentRuntime } from "./pi-deepseek-runtime";

export type AgentRuntimeProvider = "auto" | "kimi" | "pi-deepseek";
export type ResolvedAgentRuntimeProvider = "kimi" | "pi-deepseek" | "kimi-with-pi-fallback";

type RuntimeEnvironment = Record<string, string | undefined>;

type RuntimeFactories = {
  kimi?: () => AgentRuntime;
  piDeepSeek?: () => AgentRuntime;
};

function hasPiDeepSeekKey(env: RuntimeEnvironment) {
  return Boolean(env.PI_DEEPSEEK_API_KEY?.trim() || env.DEEPSEEK_API_KEY?.trim());
}

function isAbortLikeError(error: unknown) {
  return error instanceof AgentRuntimeAbortError
    || (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError"));
}

export class KimiWithPiFallbackRuntime implements AgentRuntime {
  constructor(
    private readonly primary: AgentRuntime,
    private readonly fallback: AgentRuntime,
  ) {}

  async runTurn(input: AgentRuntimeInput) {
    let textStarted = false;
    let toolStarted = false;
    const guardedInput: AgentRuntimeInput = {
      ...input,
      onTextDelta: input.onTextDelta
        ? (delta) => {
            textStarted = true;
            input.onTextDelta?.(delta);
          }
        : undefined,
      tools: input.tools.map((tool) => ({
        ...tool,
        execute: async (params, execution) => {
          toolStarted = true;
          return tool.execute(params, execution);
        },
      })),
    };

    try {
      return await this.primary.runTurn(guardedInput);
    } catch (error) {
      const fallbackIsSafe = !input.signal?.aborted
        && !isAbortLikeError(error)
        && input.images.length === 0
        && !textStarted
        && !toolStarted;
      if (!fallbackIsSafe) throw error;
      return this.fallback.runTurn(input);
    }
  }
}

export function resolveAgentRuntimeProvider(env: RuntimeEnvironment = process.env): ResolvedAgentRuntimeProvider {
  const configured = env.AGENT_RUNTIME_PROVIDER?.trim().toLowerCase() || "auto";
  if (configured !== "auto" && configured !== "kimi" && configured !== "pi-deepseek") {
    throw new Error("AGENT_RUNTIME_PROVIDER must be auto, kimi, or pi-deepseek");
  }
  if (configured === "auto") {
    return hasPiDeepSeekKey(env) ? "kimi-with-pi-fallback" : "kimi";
  }
  return configured;
}

export function createDefaultAgentRuntime(
  env: RuntimeEnvironment = process.env,
  factories: RuntimeFactories = {},
) {
  const provider = resolveAgentRuntimeProvider(env);
  const createKimi = factories.kimi ?? (() => new KimiAgentRuntime());
  const createPiDeepSeek = factories.piDeepSeek ?? (() => new PiDeepSeekAgentRuntime());
  if (provider === "pi-deepseek") return createPiDeepSeek();
  if (provider === "kimi-with-pi-fallback") {
    return new KimiWithPiFallbackRuntime(createKimi(), createPiDeepSeek());
  }
  return createKimi();
}

export const defaultAgentRuntime: AgentRuntime = createDefaultAgentRuntime();
