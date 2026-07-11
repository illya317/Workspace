import { deepseekProvider } from "./deepseek";
import { kimiProvider } from "./kimi";
import type { AgentModelProvider } from "./provider";

function selectDefaultProvider(): AgentModelProvider {
  const provider = (process.env.AGENT_MODEL_PROVIDER || "auto").toLowerCase();

  if (provider === "kimi") return kimiProvider;
  if (provider === "deepseek") return deepseekProvider;

  if (process.env.KIMI_API_KEY || process.env.KIMI_API_KEY_OC) return kimiProvider;
  return deepseekProvider;
}

export const defaultAgentModelProvider = selectDefaultProvider();
