import type { AgentTool, AgentToolResult } from "../tools";

export function agentToolWriteMode(tool: AgentTool) {
  return tool.mutates ? tool.writeMode ?? "proposal" : "read";
}

export function runtimeToolDescription(tool: AgentTool) {
  const mode = agentToolWriteMode(tool);
  const policy = mode === "direct"
    ? "DIRECT_WRITE: this tool applies an authorized Workspace change immediately and does not create a proposal."
    : mode === "proposal"
      ? "PROPOSAL_ONLY: this tool creates a pending proposal and never applies the change itself."
      : "READ_ONLY: this tool does not change Workspace data.";
  const examples = tool.examples?.length
    ? `\n\nValid call examples:\n${tool.examples.map((example, index) => [
        `Example ${index + 1} user request: ${example.user}`,
        `Example ${index + 1} arguments: ${JSON.stringify(example.arguments)}`,
      ].join("\n")).join("\n\n")}`
    : "";
  return `${tool.description}${examples}\n\nRuntime policy: ${policy}`;
}

export function assertAgentToolResultPolicy(tool: AgentTool, result: AgentToolResult) {
  if (!tool.mutates || result.type === "error") return;
  const hasProposal = result.type === "proposal" && Boolean(result.proposal);
  if (agentToolWriteMode(tool) === "direct") {
    if (hasProposal) throw new Error(`直接写入工具 ${tool.key} 不得返回 proposal`);
    return;
  }
  if (!hasProposal) throw new Error(`写入工具 ${tool.key} 未返回 proposal，已阻止执行结果`);
}
