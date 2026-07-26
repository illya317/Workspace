import { workspacePath } from "@workspace/core/routing";
import type { ReactNode } from "react";

import {
  parseAgentMarkdown,
  type AgentMarkdownInline,
} from "./agent-markdown";

export function AgentMessageMarkdown({ content }: { content: string }) {
  const blocks = parseAgentMarkdown(content);
  return (
    <div className="space-y-2 break-words">
      {blocks.map((block, blockIndex) => {
        const key = `${block.kind}-${blockIndex}`;
        if (block.kind === "heading") {
          const className = block.level === 1
            ? "pt-1 text-base font-semibold leading-7 text-slate-950"
            : block.level === 2
              ? "pt-1 text-sm font-semibold leading-6 text-slate-950"
              : "pt-0.5 text-sm font-medium leading-6 text-slate-900";
          return <div key={key} role="heading" aria-level={block.level} className={className}>{inline(block.content)}</div>;
        }
        if (block.kind === "paragraph") {
          return <p key={key}>{withLineBreaks(block.lines)}</p>;
        }
        if (block.kind === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List key={key} className={`space-y-1 pl-5 ${block.ordered ? "list-decimal" : "list-disc"}`}>
              {block.items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>{inline(item)}</li>)}
            </List>
          );
        }
        if (block.kind === "quote") {
          return <blockquote key={key} className="border-l-2 border-slate-300 pl-3 text-slate-600">{withLineBreaks(block.lines)}</blockquote>;
        }
        if (block.kind === "code") {
          return (
            <pre key={key} className="max-w-full overflow-x-auto rounded-md bg-slate-950 px-3 py-2 text-xs leading-5 text-slate-100">
              <code data-language={block.language ?? undefined}>{block.content}</code>
            </pre>
          );
        }
        if (block.kind === "table") {
          return (
            <div key={key} role="table" className="max-w-full rounded-md border border-slate-200 text-left text-xs">
              <div role="row" className="flex bg-slate-50 text-slate-700">
                {block.header.map((cell, cellIndex) => <div key={`${key}-h-${cellIndex}`} role="columnheader" className="min-w-0 flex-1 border-b border-slate-200 px-2 py-1.5 font-semibold">{inline(cell)}</div>)}
              </div>
              {block.rows.map((row, rowIndex) => (
                <div key={`${key}-r-${rowIndex}`} role="row" className="flex border-b border-slate-100 last:border-0">
                  {row.map((cell, cellIndex) => <div key={`${key}-${rowIndex}-${cellIndex}`} role="cell" className="min-w-0 flex-1 px-2 py-1.5 align-top">{inline(cell)}</div>)}
                </div>
              ))}
            </div>
          );
        }
        return <hr key={key} className="border-slate-200" />;
      })}
    </div>
  );
}

function inline(tokens: AgentMarkdownInline[]) {
  return tokens.map((token, index): ReactNode => {
    const key = `${token.kind}-${index}`;
    if (token.kind === "strong") return <strong key={key} className="font-semibold text-slate-950">{token.text}</strong>;
    if (token.kind === "code") return <code key={key} className="rounded bg-slate-100 px-1 py-0.5 text-[0.92em] text-slate-900">{token.text}</code>;
    if (token.kind === "link") {
      const internal = token.href.startsWith("/");
      return (
        <a
          key={key}
          href={internal ? workspacePath(token.href) : token.href}
          {...(!internal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className="font-medium text-emerald-700 underline decoration-emerald-300 underline-offset-2 hover:text-emerald-800"
        >
          {token.text}
        </a>
      );
    }
    return token.text;
  });
}

function withLineBreaks(lines: AgentMarkdownInline[][]) {
  return lines.flatMap((line, index) => index === 0
    ? inline(line)
    : [<br key={`br-${index}`} />, ...inline(line)]);
}
