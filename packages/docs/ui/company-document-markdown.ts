import type {
  EditorBlock,
  EditorDocument,
  EditorInline,
  EditorTableCell,
} from "@workspace/platform/document-editor";
import {
  parseAgentMarkdown,
  type AgentMarkdownInline,
} from "@workspace/platform/ui/agent-markdown";

function textPart(text: string, bold = false): EditorInline {
  return { type: "text", text: text.replace(/<br\s*\/?\s*>/gi, "\n"), ...(bold ? { bold: true } : {}) };
}

function inlineParts(tokens: AgentMarkdownInline[]): EditorInline[] {
  return tokens.flatMap((token) => {
    if (token.kind === "strong") return [textPart(token.text, true)];
    if (token.kind === "link") return [textPart(`${token.text}（${token.href}）`)];
    return [textPart(token.text)];
  });
}

function tableCell(tokens: AgentMarkdownInline[], header = false): EditorTableCell {
  return { parts: inlineParts(tokens), header, bold: header, align: "left" };
}

export function companyDocumentFromMarkdown(input: {
  key: string;
  title: string;
  markdown: string;
}): EditorDocument {
  const source = input.markdown.replace(/^<!--.*?-->\s*/s, "");
  const parsed = parseAgentMarkdown(source);
  const blocks: EditorBlock[] = [];
  let sequence = 0;
  const nextId = (kind: string) => `${input.key}-${kind}-${++sequence}`;

  for (const block of parsed) {
    if (block.kind === "heading") {
      blocks.push({
        id: nextId("heading"),
        type: "heading",
        level: block.level,
        text: block.content.map((token) => token.text).join(""),
      });
      continue;
    }
    if (block.kind === "paragraph") {
      blocks.push({
        id: nextId("paragraph"),
        type: "paragraph",
        parts: block.lines.flatMap((line, index) => [
          ...(index ? [textPart("\n")] : []),
          ...inlineParts(line),
        ]),
      });
      continue;
    }
    if (block.kind === "list") {
      block.items.forEach((item, index) => blocks.push({
        id: nextId("list"),
        type: "paragraph",
        parts: [textPart(block.ordered ? `${index + 1}. ` : "• "), ...inlineParts(item)],
      }));
      continue;
    }
    if (block.kind === "quote") {
      blocks.push({
        id: nextId("quote"),
        type: "paragraph",
        parts: [textPart("│ "), ...block.lines.flatMap((line, index) => [
          ...(index ? [textPart("\n│ ")] : []),
          ...inlineParts(line),
        ])],
      });
      continue;
    }
    if (block.kind === "code") {
      blocks.push({
        id: nextId("code"),
        type: "paragraph",
        parts: [textPart(block.content)],
      });
      continue;
    }
    if (block.kind === "table") {
      blocks.push({
        id: nextId("table"),
        type: "table",
        rows: [
          { cells: block.header.map((cell) => tableCell(cell, true)) },
          ...block.rows.map((row) => ({ cells: row.map((cell) => tableCell(cell)) })),
        ],
      });
      continue;
    }
    blocks.push({ id: nextId("divider"), type: "paragraph", parts: [textPart("━━━━━━━━━━━━━━━━")] });
  }

  return {
    schemaVersion: 1,
    kind: "editor-document",
    id: input.key,
    title: input.title,
    blocks,
  };
}
