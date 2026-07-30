import type { ProtocolClient } from "@moonshot-ai/kimi-agent-sdk";
import type { AgentChoiceQuestion } from "@workspace/platform/agent-conversation-choice";

export type CapturedClarificationQuestion = AgentChoiceQuestion;

type WorkspaceQuestionRequest = {
  id?: string;
  questions?: Array<{
    question?: string;
    header?: string;
    options?: Array<{ label?: string; description?: string }>;
    multi_select?: boolean;
  }>;
};

function interactiveRequest(payload: unknown) {
  return typeof payload === "object" && payload !== null
    ? payload as WorkspaceQuestionRequest
    : {};
}

function captureQuestions(payload: unknown): CapturedClarificationQuestion[] {
  const request = interactiveRequest(payload);
  return (request.questions ?? []).flatMap((question) => {
    const text = question.question?.trim();
    if (!text) return [];
    return [{
      question: text,
      header: question.header?.trim() || undefined,
      options: (question.options ?? []).flatMap((option) => {
        const label = option.label?.trim();
        return label ? [{ label, description: option.description?.trim() || undefined }] : [];
      }),
      multiSelect: question.multi_select === true,
    }];
  });
}

export function clarificationMessage(questions: CapturedClarificationQuestion[]) {
  const lines = questions.flatMap((question, index) => {
    const heading = `${index + 1}. ${question.header ? `${question.header}：` : ""}${question.question}`;
    const options = question.options.length > 0
      ? `   可选：${question.options.map((option) => (
          option.description ? `${option.label}（${option.description}）` : option.label
        )).join("；")}${question.multiSelect ? "（可多选）" : ""}`
      : "";
    return options ? [heading, options] : [heading];
  });
  return ["需要你先确认以下信息：", ...lines, "请选择下方选项，或直接回复所需信息；确认完整后我再生成待确认变更。"].join("\n");
}

export async function handleKimiInteractiveRequest(
  client: Pick<ProtocolClient, "sendApproval" | "sendQuestionResponse">,
  event: { type: string; id?: string; payload?: unknown },
  state: { clarification?: CapturedClarificationQuestion[] },
) {
  const request = interactiveRequest(event.payload);
  const rpcRequestId = event.id?.trim() || request.id?.trim();
  if (event.type === "ApprovalRequest" && rpcRequestId) {
    await client.sendApproval(rpcRequestId, "reject");
    return;
  }
  if (event.type !== "QuestionRequest" || !rpcRequestId) return;

  const questions = captureQuestions(request);
  if (questions.length > 0) state.clarification = [...(state.clarification ?? []), ...questions];
  const answers = Object.fromEntries(
    questions.map((question) => [question.question, "等待用户在下一轮确认"]),
  );
  await client.sendQuestionResponse(
    rpcRequestId,
    request.id?.trim() || rpcRequestId,
    Object.keys(answers).length > 0 ? answers : { clarification: "等待用户在下一轮确认" },
  );
}
