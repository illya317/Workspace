export type AgentChoiceOption = {
  label: string;
  description?: string;
};

export type AgentChoiceQuestion = {
  question: string;
  header?: string;
  options: AgentChoiceOption[];
  multiSelect: boolean;
};

export type AgentChoiceSubmission = {
  selectedLabels: string[][];
  reply: string;
};

export function agentChoiceQuestionLabel(question: AgentChoiceQuestion) {
  return question.header?.trim() || question.question.trim();
}

export function agentChoiceUsesCards(question: AgentChoiceQuestion) {
  return question.multiSelect
    || question.options.length > 4
    || question.options.some((option) => Boolean(option.description?.trim()));
}

export function buildAgentChoiceReply(
  questions: AgentChoiceQuestion[],
  selectedLabels: string[][],
) {
  const lines = questions.flatMap((question, index) => {
    const labels = selectedLabels[index]?.filter(Boolean) ?? [];
    if (labels.length === 0) return [];
    return [`${agentChoiceQuestionLabel(question)}：${labels.join("、")}`];
  });
  return lines.length === 1 ? lines[0] : ["我的选择：", ...lines.map((line) => `- ${line}`)].join("\n");
}
