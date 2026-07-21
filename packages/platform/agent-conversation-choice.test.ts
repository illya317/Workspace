import assert from "node:assert/strict";
import test from "node:test";

import {
  agentChoiceQuestionLabel,
  agentChoiceUsesCards,
  buildAgentChoiceReply,
  type AgentChoiceQuestion,
} from "./agent-conversation-choice";

test("short choices use chips while descriptive and multi-select choices use cards", () => {
  const chips: AgentChoiceQuestion = {
    question: "优先级？",
    options: [{ label: "高" }, { label: "中" }, { label: "低" }],
    multiSelect: false,
  };

  assert.equal(agentChoiceUsesCards(chips), false);
  assert.equal(agentChoiceUsesCards({
    ...chips,
    options: [{ label: "高", description: "今天处理" }, { label: "低" }],
  }), true);
  assert.equal(agentChoiceUsesCards({ ...chips, multiSelect: true }), true);
});

test("choice reply keeps visible labels and question context", () => {
  const questions: AgentChoiceQuestion[] = [{
    question: "要写入哪个工作空间？",
    header: "工作空间",
    options: [{ label: "个人空间" }, { label: "部门空间" }],
    multiSelect: false,
  }, {
    question: "选择要通知的人",
    options: [{ label: "负责人" }, { label: "参与人" }],
    multiSelect: true,
  }];

  assert.equal(agentChoiceQuestionLabel(questions[0]), "工作空间");
  assert.equal(buildAgentChoiceReply(questions, [["个人空间"], ["负责人", "参与人"]]), [
    "我的选择：",
    "- 工作空间：个人空间",
    "- 选择要通知的人：负责人、参与人",
  ].join("\n"));
});
