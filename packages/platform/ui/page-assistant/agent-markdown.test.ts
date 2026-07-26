import assert from "node:assert/strict";
import test from "node:test";

import { parseAgentMarkdown, parseAgentMarkdownInline } from "./agent-markdown";

test("Agent Markdown parses bold text instead of exposing markers", () => {
  const tokens = parseAgentMarkdownInline("这是 **重点内容**。");
  assert.deepEqual(tokens, [
    { kind: "text", text: "这是 " },
    { kind: "strong", text: "重点内容" },
    { kind: "text", text: "。" },
  ]);
});

test("Agent Markdown keeps unsafe links inert", () => {
  const tokens = parseAgentMarkdownInline("[点击](javascript:run(1))");
  assert.deepEqual(tokens, [{ kind: "text", text: "点击" }, { kind: "text", text: ")" }]);
});

test("Agent Markdown parses headings, lists, code and tables", () => {
  const blocks = parseAgentMarkdown([
    "## 结果",
    "",
    "- 第一项",
    "- 第二项",
    "",
    "```ts",
    "const ok = true;",
    "```",
    "",
    "| 字段 | 值 |",
    "| --- | --- |",
    "| 状态 | 完成 |",
  ].join("\n"));

  assert.deepEqual(blocks.map((block) => block.kind), ["heading", "list", "code", "table"]);
});

test("Agent Markdown preserves fourth-level document headings", () => {
  const [heading] = parseAgentMarkdown("#### 成品入库报单");
  assert.equal(heading?.kind, "heading");
  if (heading?.kind === "heading") assert.equal(heading.level, 4);
});
