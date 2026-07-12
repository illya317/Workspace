import type {
  AgentModelToolDefinition,
  AgentToolCallMessage,
} from "./model/provider";

/**
 * Kimi exposes a 262,144-token context window. Keep 32,768 tokens for output
 * and another 32,768 character-units for tokenization and request-envelope
 * variance. Text and JSON use serialized character length; image data URLs
 * remain intact on the wire but count as a fixed 16,384-character model cost.
 * This is a deliberately conservative, provider-independent approximation.
 */
export const AGENT_TOOL_CALL_REQUEST_CHAR_BUDGET = 196_608;

const MIN_COMPACTED_TOOL_MESSAGE_CHARS = 512;
const IMAGE_CONTEXT_CHAR_COST = 16_384;

type ToolCallGroup = {
  indices: number[];
};

function serializedLength(value: unknown) {
  return JSON.stringify(value).length;
}

function messageLength(message: AgentToolCallMessage) {
  if (message.role !== "user" || typeof message.content === "string") {
    return serializedLength(message);
  }

  let imageCount = 0;
  const projectedContent = message.content.map((part) => {
    if (part.type !== "image_url") return part;
    imageCount += 1;
    return { ...part, image_url: { url: "[image]" } };
  });
  return serializedLength({ ...message, content: projectedContent })
    + imageCount * IMAGE_CONTEXT_CHAR_COST;
}

function messageLengths(messages: AgentToolCallMessage[]) {
  return messages.map(messageLength);
}

function requestFixedLength(tools: AgentModelToolDefinition[]) {
  return serializedLength({ messages: [], tools }) - 2;
}

function selectedRequestLength(
  selected: Set<number>,
  lengths: number[],
  fixedLength: number,
) {
  if (selected.size === 0) return fixedLength + 2;
  let total = fixedLength + selected.size - 1;
  for (const index of selected) total += lengths[index] ?? 0;
  return total;
}

export function estimateAgentToolCallRequestChars(
  messages: AgentToolCallMessage[],
  tools: AgentModelToolDefinition[],
) {
  const lengths = messageLengths(messages);
  return selectedRequestLength(
    new Set(messages.map((_, index) => index)),
    lengths,
    requestFixedLength(tools),
  );
}

function findLastUserIndex(messages: AgentToolCallMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") return index;
  }
  return -1;
}

function collectCompleteToolCallGroups(
  messages: AgentToolCallMessage[],
  currentUserIndex: number,
): ToolCallGroup[] {
  const groups: ToolCallGroup[] = [];
  for (let index = currentUserIndex + 1; index < messages.length; index += 1) {
    const message = messages[index];
    if (message?.role !== "assistant" || !message.tool_calls?.length) continue;

    const expectedIds = new Set(message.tool_calls.map((call) => call.id));
    const foundIds = new Set<string>();
    const indices = [index];
    let cursor = index + 1;
    while (cursor < messages.length && messages[cursor]?.role === "tool") {
      const toolMessage = messages[cursor];
      if (toolMessage?.role === "tool" && expectedIds.has(toolMessage.tool_call_id)) {
        foundIds.add(toolMessage.tool_call_id);
        indices.push(cursor);
      }
      cursor += 1;
    }

    if ([...expectedIds].every((id) => foundIds.has(id))) {
      groups.push({ indices });
    }
    index = cursor - 1;
  }
  return groups;
}

function compactedToolEnvelope(content: string, prefixLength: number) {
  return JSON.stringify({
    truncated: true,
    reason: "tool_call_request_exceeded_character_budget",
    originalChars: content.length,
    jsonPrefix: content.slice(0, prefixLength),
  });
}

function compactToolContent(content: string, maxChars: number) {
  if (content.length <= maxChars) return content;
  let lower = 0;
  let upper = Math.min(content.length, maxChars);
  let compact = compactedToolEnvelope(content, 0);
  while (lower <= upper) {
    const middle = Math.floor((lower + upper) / 2);
    const candidate = compactedToolEnvelope(content, middle);
    if (candidate.length <= maxChars) {
      compact = candidate;
      lower = middle + 1;
    } else {
      upper = middle - 1;
    }
  }
  return compact.length <= maxChars ? compact : JSON.stringify({ truncated: true });
}

function compactLatestToolGroupToFit(
  messages: AgentToolCallMessage[],
  group: ToolCallGroup,
  selected: Set<number>,
  tools: AgentModelToolDefinition[],
  budgetChars: number,
) {
  const toolIndices = group.indices.filter((index) => messages[index]?.role === "tool");
  for (const index of toolIndices) {
    const message = messages[index];
    if (message?.role !== "tool") continue;
    const selectedMessages = () => messages.filter((_, messageIndex) => selected.has(messageIndex));
    if (estimateAgentToolCallRequestChars(selectedMessages(), tools) <= budgetChars) break;

    const originalContent = message.content;
    let lower = MIN_COMPACTED_TOOL_MESSAGE_CHARS;
    let upper = originalContent.length - 1;
    let best = compactToolContent(originalContent, MIN_COMPACTED_TOOL_MESSAGE_CHARS);
    while (lower <= upper) {
      const middle = Math.floor((lower + upper) / 2);
      const candidate = compactToolContent(originalContent, middle);
      messages[index] = { ...message, content: candidate };
      if (estimateAgentToolCallRequestChars(selectedMessages(), tools) <= budgetChars) {
        best = candidate;
        lower = middle + 1;
      } else {
        upper = middle - 1;
      }
    }
    messages[index] = { ...message, content: best };
  }
}

/**
 * Fits one native-tool request without mutating the accumulated conversation.
 * The base system prompt, current user message and newest complete tool-call
 * exchange are retained. Source-preload system context is preferred next, then
 * older complete tool exchanges and finally recent plain history. Tool calls
 * and their results are always selected as an atomic group.
 */
export function fitAgentToolCallMessages(
  inputMessages: AgentToolCallMessage[],
  tools: AgentModelToolDefinition[],
  budgetChars = AGENT_TOOL_CALL_REQUEST_CHAR_BUDGET,
) {
  if (inputMessages.length === 0) return [];

  const messages = inputMessages.map((message) => ({ ...message }));
  const currentUserIndex = findLastUserIndex(messages);
  const baseSystemIndex = messages.findIndex((message) => message.role === "system");
  const toolGroups = collectCompleteToolCallGroups(messages, currentUserIndex);
  const latestToolGroup = toolGroups.at(-1);
  const requiredIndices = [
    ...(baseSystemIndex >= 0 ? [baseSystemIndex] : []),
    ...(currentUserIndex >= 0 ? [currentUserIndex] : []),
    ...(latestToolGroup?.indices ?? []),
  ];
  const selected = new Set(requiredIndices);

  if (latestToolGroup) {
    compactLatestToolGroupToFit(messages, latestToolGroup, selected, tools, budgetChars);
  }

  const lengths = messageLengths(messages);
  const fixedLength = requestFixedLength(tools);
  let selectedLength = selectedRequestLength(selected, lengths, fixedLength);
  if (selectedLength > budgetChars) {
    throw new Error(`Agent tool-call mandatory context exceeds ${budgetChars} characters`);
  }

  const trySelectUnit = (unit: number[]) => {
    if (unit.length === 0 || unit.some((index) => selected.has(index))) return true;
    const addedLength = unit.reduce((total, index) => total + (lengths[index] ?? 0), 0) + unit.length;
    if (selectedLength + addedLength > budgetChars) return false;
    for (const index of unit) selected.add(index);
    selectedLength += addedLength;
    return true;
  };

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "system" && !selected.has(index)) {
      trySelectUnit([index]);
    }
  }
  for (let index = toolGroups.length - 2; index >= 0; index -= 1) {
    if (!trySelectUnit(toolGroups[index]?.indices ?? [])) break;
  }

  const groupedToolIndices = new Set(toolGroups.flatMap((group) => group.indices));
  const historyUnits: number[][] = [];
  for (let index = 0; index < currentUserIndex; index += 1) {
    const message = messages[index];
    if (selected.has(index) || groupedToolIndices.has(index) || message?.role === "system") continue;
    if (message?.role === "user") {
      historyUnits.push([index]);
      continue;
    }
    const currentUnit = historyUnits.at(-1);
    if (currentUnit) currentUnit.push(index);
    else historyUnits.push([index]);
  }
  for (const unit of historyUnits.reverse()) {
    if (!trySelectUnit(unit)) break;
  }

  return messages.filter((_, index) => selected.has(index));
}
