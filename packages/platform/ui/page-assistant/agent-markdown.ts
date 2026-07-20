export type AgentMarkdownInline =
  | { kind: "text"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; href: string };

export type AgentMarkdownBlock =
  | { kind: "paragraph"; lines: AgentMarkdownInline[][] }
  | { kind: "heading"; level: 1 | 2 | 3; content: AgentMarkdownInline[] }
  | { kind: "list"; ordered: boolean; items: AgentMarkdownInline[][] }
  | { kind: "quote"; lines: AgentMarkdownInline[][] }
  | { kind: "code"; language: string | null; content: string }
  | { kind: "table"; header: AgentMarkdownInline[][]; rows: AgentMarkdownInline[][][] }
  | { kind: "divider" };

const INLINE_PATTERN = /(\*\*([^*\n]+)\*\*|`([^`\n]+)`|\[([^\]\n]+)\]\(([^)\s]+)\))/g;

export function parseAgentMarkdown(markdown: string): AgentMarkdownBlock[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: AgentMarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^```\s*([^\s`]*)\s*$/);
    if (fence) {
      const content: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index] ?? "")) {
        content.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ kind: "code", language: fence[1] || null, content: content.join("\n") });
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: heading[1].length as 1 | 2 | 3,
        content: parseAgentMarkdownInline(heading[2]),
      });
      index += 1;
      continue;
    }

    if (/^\s*(?:---+|\*\*\*+)\s*$/.test(line)) {
      blocks.push({ kind: "divider" });
      index += 1;
      continue;
    }

    if (isTableHeader(lines, index)) {
      const header = tableCells(line).map(parseAgentMarkdownInline);
      const rows: AgentMarkdownInline[][][] = [];
      index += 2;
      while (index < lines.length && isTableRow(lines[index] ?? "")) {
        rows.push(tableCells(lines[index] ?? "").map(parseAgentMarkdownInline));
        index += 1;
      }
      blocks.push({ kind: "table", header, rows });
      continue;
    }

    const listMatch = line.match(/^\s*(?:([-+*])|(\d+)\.)\s+(.+)$/);
    if (listMatch) {
      const ordered = Boolean(listMatch[2]);
      const items: AgentMarkdownInline[][] = [];
      while (index < lines.length) {
        const item = (lines[index] ?? "").match(/^\s*(?:([-+*])|(\d+)\.)\s+(.+)$/);
        if (!item || Boolean(item[2]) !== ordered) break;
        items.push(parseAgentMarkdownInline(item[3]));
        index += 1;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quoteLines: AgentMarkdownInline[][] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index] ?? "")) {
        quoteLines.push(parseAgentMarkdownInline((lines[index] ?? "").replace(/^\s*>\s?/, "")));
        index += 1;
      }
      blocks.push({ kind: "quote", lines: quoteLines });
      continue;
    }

    const paragraphLines: AgentMarkdownInline[][] = [];
    while (index < lines.length && (lines[index] ?? "").trim() && !startsBlock(lines, index)) {
      paragraphLines.push(parseAgentMarkdownInline(lines[index] ?? ""));
      index += 1;
    }
    if (paragraphLines.length === 0) {
      paragraphLines.push(parseAgentMarkdownInline(line));
      index += 1;
    }
    blocks.push({ kind: "paragraph", lines: paragraphLines });
  }

  return blocks;
}

export function parseAgentMarkdownInline(text: string): AgentMarkdownInline[] {
  const tokens: AgentMarkdownInline[] = [];
  let offset = 0;
  INLINE_PATTERN.lastIndex = 0;
  for (let match = INLINE_PATTERN.exec(text); match; match = INLINE_PATTERN.exec(text)) {
    if (match.index > offset) tokens.push({ kind: "text", text: text.slice(offset, match.index) });
    if (match[2] !== undefined) tokens.push({ kind: "strong", text: match[2] });
    else if (match[3] !== undefined) tokens.push({ kind: "code", text: match[3] });
    else if (match[4] !== undefined && safeAgentMarkdownHref(match[5])) {
      tokens.push({ kind: "link", text: match[4], href: match[5] });
    } else {
      tokens.push({ kind: "text", text: match[4] ?? match[0] });
    }
    offset = match.index + match[0].length;
  }
  if (offset < text.length) tokens.push({ kind: "text", text: text.slice(offset) });
  return tokens.length ? tokens : [{ kind: "text", text }];
}

export function safeAgentMarkdownHref(href: string) {
  return href.startsWith("/") && !href.startsWith("//")
    || /^https?:\/\//i.test(href)
    || /^mailto:/i.test(href);
}

function startsBlock(lines: string[], index: number) {
  const line = lines[index] ?? "";
  return /^```/.test(line)
    || /^(#{1,3})\s+/.test(line)
    || /^\s*(?:[-+*]|\d+\.)\s+/.test(line)
    || /^\s*>\s?/.test(line)
    || /^\s*(?:---+|\*\*\*+)\s*$/.test(line)
    || isTableHeader(lines, index);
}

function isTableHeader(lines: string[], index: number) {
  return isTableRow(lines[index] ?? "") && /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1] ?? "");
}

function isTableRow(line: string) {
  return line.includes("|") && tableCells(line).length > 1;
}

function tableCells(line: string) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}
