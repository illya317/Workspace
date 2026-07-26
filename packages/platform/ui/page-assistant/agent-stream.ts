import {
  responseMessage,
  type AgentResponse,
  type AgentStreamEvent,
} from "./types";

function parseEvent(line: string): AgentStreamEvent {
  const value = JSON.parse(line) as AgentStreamEvent;
  if (!value || typeof value !== "object" || typeof value.event !== "string") {
    throw new Error("智能体返回了无效的流式事件");
  }
  return value;
}

async function responseError(response: Response) {
  const body = await response.json().catch(() => null) as AgentResponse | null;
  return new Error(body ? responseMessage(body) : `请求失败（${response.status}）`);
}

export async function readAgentStream(
  response: Response,
  onEvent: (event: AgentStreamEvent) => void,
): Promise<AgentResponse> {
  if (!response.ok) throw await responseError(response);
  if (!response.body) throw new Error("智能体没有返回响应流");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let result: AgentResponse | null = null;

  const consumeLine = (line: string) => {
    if (!line.trim()) return;
    const event = parseEvent(line);
    onEvent(event);
    if (event.event === "result") result = event.data;
    if (event.event === "error") throw new Error(event.message);
  };

  while (true) {
    const { value, done } = await reader.read();
    buffered += decoder.decode(value, { stream: !done });
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    for (const line of lines) consumeLine(line);
    if (done) break;
  }
  consumeLine(buffered);
  if (!result) throw new Error("智能体响应流未正常结束");
  return result;
}
