import { workspacePath } from "@workspace/core/routing";
import { ActionGlyph } from "@workspace/core/ui";
import { useState, type ReactNode, type RefObject } from "react";

import type { AgentConversationStarter, AssistantMessage } from "./types";
import { AgentMessageMarkdown } from "./AgentMessageMarkdown";
import { proposalCanSettle, proposalStatusLabel } from "./proposal-state";
import { proposalDiffText } from "./types";

type ResourceItem = {
  key: string;
  title: string;
  subtitle?: string;
  meta?: string;
  openHref?: string;
  downloadHref?: string;
};

type ResourceBundle = {
  label: string;
  createHref: string;
  requestBody: unknown;
  responseKey: string;
  downloadHrefTemplate: string;
};

type ResourceSet = {
  kind: "resource-set";
  items: ResourceItem[];
  bundle?: ResourceBundle;
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

function safeWorkspaceHref(value: unknown) {
  const href = stringValue(value);
  return href?.startsWith("/") && !href.startsWith("//") ? href : undefined;
}

function resourceSetFromAgentData(data: unknown): ResourceSet | null {
  const root = record(data);
  const presentation = record(root?.presentation);
  if (presentation?.kind !== "resource-set" || !Array.isArray(presentation.items)) return null;
  const items = presentation.items.flatMap((raw): ResourceItem[] => {
    const item = record(raw);
    const key = stringValue(item?.key);
    const title = stringValue(item?.title);
    if (!key || !title) return [];
    return [{
      key,
      title,
      subtitle: stringValue(item?.subtitle),
      meta: stringValue(item?.meta),
      openHref: safeWorkspaceHref(item?.openHref),
      downloadHref: safeWorkspaceHref(item?.downloadHref),
    }];
  });
  const rawBundle = record(presentation.bundle);
  const createHref = safeWorkspaceHref(rawBundle?.createHref);
  const downloadHrefTemplate = safeWorkspaceHref(rawBundle?.downloadHrefTemplate);
  const bundle = rawBundle && createHref && downloadHrefTemplate
    && stringValue(rawBundle.label) && stringValue(rawBundle.responseKey)
    ? {
        label: stringValue(rawBundle.label)!,
        createHref,
        requestBody: rawBundle.requestBody,
        responseKey: stringValue(rawBundle.responseKey)!,
        downloadHrefTemplate,
      }
    : undefined;
  return { kind: "resource-set", items, bundle };
}

function triggerDownload(href: string) {
  const anchor = document.createElement("a");
  anchor.href = workspacePath(href);
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

type Props = {
  messages: AssistantMessage[];
  sending: boolean;
  busyProposalId: number | null;
  scrollRef: RefObject<HTMLDivElement | null>;
  emptyState?: ReactNode;
  settleProposal: (messageId: string, proposalId: number, action: "confirm" | "cancel") => void | Promise<void>;
};

/** @ui-specialized-surface Page Assistant message stream owns chat bubbles, attachments, and proposal settlement. */
export function PageAssistantMessages({
  messages,
  sending,
  busyProposalId,
  scrollRef,
  settleProposal,
  emptyState,
}: Props) {
  return (
    <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 px-3 py-4 sm:px-4 sm:py-3">
      {messages.length === 0 ? (
        emptyState ?? (
          <div className="grid min-h-full place-items-center px-8 text-center">
            <div>
              <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><ActionGlyph kind="assistant" className="size-6" /></div>
              <div className="text-sm font-semibold text-slate-800">开始和页面助手对话</div>
              <div className="mt-1 text-xs leading-5 text-slate-500">它会结合当前页面和栏目理解你的问题。</div>
            </div>
          </div>
        )
      ) : null}
      {messages.map((message) => (
        <article key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
          <div
            className={`${message.role === "user" ? "max-w-[86%]" : "w-full sm:max-w-[88%]"} rounded-lg px-3 py-2 text-sm leading-6 ${
              message.role === "user"
                ? "bg-emerald-600 text-white shadow-sm"
                : message.responseType === "error"
                  ? "border border-red-200 bg-red-50 text-red-800"
                  : "bg-transparent text-slate-800 sm:border sm:border-slate-200 sm:bg-white sm:shadow-sm"
            }`}
          >
            {message.role === "agent"
              ? <AgentMessageMarkdown content={message.content} />
              : <div className="whitespace-pre-wrap">{message.content}</div>}
            <MessageAttachments message={message} />
            <MessageData message={message} />
            {message.proposal ? (
              <ProposalBlock
                message={message}
                busyProposalId={busyProposalId}
                settleProposal={settleProposal}
              />
            ) : null}
          </div>
        </article>
      ))}
      {sending ? <div className="text-xs text-slate-500">正在思考...</div> : null}
    </div>
  );
}

function MessageData({ message }: { message: AssistantMessage }) {
  if (message.role !== "agent") return null;
  const resourceSet = resourceSetFromAgentData(message.data);
  return resourceSet ? <AgentResourceSet resourceSet={resourceSet} /> : null;
}

function AgentResourceSet({ resourceSet }: { resourceSet: ResourceSet }) {
  const [packing, setPacking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function downloadBundle() {
    const bundle = resourceSet.bundle;
    if (!bundle || packing) return;
    setPacking(true);
    setError(null);
    try {
      const response = await fetch(workspacePath(bundle.createHref), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bundle.requestBody),
      });
      const body = await response.json().catch(() => null) as Record<string, unknown> | null;
      if (!response.ok) {
        throw new Error(stringValue(body?.error) || stringValue(body?.message) || `资料包生成失败（${response.status}）`);
      }
      const value = stringValue(body?.[bundle.responseKey]);
      if (!value) throw new Error("资料包生成成功，但未返回下载标识");
      triggerDownload(bundle.downloadHrefTemplate.replace(`{${bundle.responseKey}}`, encodeURIComponent(value)));
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "资料包生成失败");
    } finally {
      setPacking(false);
    }
  }

  if (resourceSet.items.length === 0) return null;
  return (
    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
      <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
        {resourceSet.items.map((item) => (
          <div key={item.key} className="rounded-md border border-slate-200 bg-slate-50 p-2">
            <div className="truncate text-xs font-semibold text-slate-900" title={item.title}>{item.title}</div>
            <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[11px] text-slate-500">
              {item.subtitle ? <span className="truncate">{item.subtitle}</span> : null}
              {item.meta ? <span className="ml-auto shrink-0">{item.meta}</span> : null}
            </div>
            <div className="mt-2 flex justify-end gap-2">
              {item.openHref ? (
                <a href={workspacePath(item.openHref)} className="inline-flex h-7 items-center gap-1 rounded border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-700 hover:bg-slate-100">
                  <ActionGlyph kind="view" className="h-3.5 w-3.5" />
                  打开
                </a>
              ) : null}
              {item.downloadHref ? (
                <a href={workspacePath(item.downloadHref)} target="_blank" rel="noopener noreferrer" className="inline-flex h-7 items-center gap-1 rounded border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-700 hover:bg-slate-100">
                  <ActionGlyph kind="download" className="h-3.5 w-3.5" />
                  下载
                </a>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {resourceSet.bundle ? (
        <button
          type="button"
          disabled={packing}
          onClick={() => void downloadBundle()}
          className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-300"
        >
          <ActionGlyph kind="archive" className="h-3.5 w-3.5" />
          {packing ? "正在生成资料包..." : resourceSet.bundle.label}
        </button>
      ) : null}
      {error ? <div className="text-xs leading-5 text-red-600">{error}</div> : null}
    </div>
  );
}

function MessageAttachments({ message }: { message: AssistantMessage }) {
  if (!message.attachments?.length) return null;
  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      {message.attachments.map((attachment) => (
        <figure
          key={attachment.id}
          className={`overflow-hidden rounded-md border ${
            message.role === "user" ? "border-emerald-200 bg-emerald-500/20" : "border-slate-200 bg-slate-50"
          }`}
        >
          {attachment.previewUrl ? (
            <div
              role="img"
              aria-label={attachment.name}
              className="h-24 w-full bg-cover bg-center"
              style={{ backgroundImage: `url(${attachment.previewUrl})` }}
            />
          ) : null}
          <figcaption className={`truncate px-2 py-1 text-[11px] ${message.role === "user" ? "text-emerald-50" : "text-slate-500"}`}>
            {attachment.name}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

function ProposalBlock({
  message,
  busyProposalId,
  settleProposal,
}: Pick<Props, "busyProposalId" | "settleProposal"> & { message: AssistantMessage }) {
  const proposal = message.proposal;
  if (!proposal) return null;
  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
      <div className="font-medium text-slate-900">
        变更 #{proposal.id} · {proposal.actionKey}
      </div>
      <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-words rounded bg-white p-2 text-[11px] leading-5 text-slate-700">
        {proposalDiffText(proposal)}
      </pre>
      {proposalCanSettle(message.proposalStatus) ? (
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            title="取消"
            disabled={busyProposalId === proposal.id}
            onClick={() => void settleProposal(message.id, proposal.id, "cancel")}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <ActionGlyph kind="cancel" className="h-3.5 w-3.5" />
            取消
          </button>
          <button
            type="button"
            title="确认"
            disabled={busyProposalId === proposal.id}
            onClick={() => void settleProposal(message.id, proposal.id, "confirm")}
            className="inline-flex h-8 items-center gap-1 rounded-md bg-emerald-600 px-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            <ActionGlyph kind="approve" className="h-3.5 w-3.5" />
            确认
          </button>
        </div>
      ) : (
        <div className="mt-2 text-xs font-medium text-slate-500">
          {proposalStatusLabel(message.proposalStatus)}
        </div>
      )}
    </div>
  );
}

/** @ui-specialized-surface Page Assistant empty state owns reusable prompt and deep-link starters. */
export function AgentConversationEmptyState({
  title,
  description,
  starters,
  enabled,
  disabledMessage,
  onPrompt,
}: {
  title: string;
  description: string;
  starters: AgentConversationStarter[];
  enabled: boolean;
  disabledMessage: string;
  onPrompt: (prompt: string) => void;
}) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-4 py-8 text-left sm:px-8 sm:py-12">
      <div className="mb-5 inline-flex size-12 items-center justify-center rounded-2xl bg-emerald-950 text-emerald-100 shadow-[0_12px_30px_rgba(6,78,59,0.24)]">
        <ActionGlyph kind="assistant" className="size-6" />
      </div>
      <h3 className="max-w-xl text-2xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{title}</h3>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500 sm:text-base">{enabled ? description : disabledMessage}</p>
      {starters.length ? (
        <div className="mt-8 grid gap-2 sm:grid-cols-2 sm:gap-3">
          {starters.map((starter) => starter.href ? (
            <a
              key={starter.key}
              href={workspacePath(starter.href)}
              className="group rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-lg"
            >
              <div className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-900">
                {starter.label}
                <ActionGlyph kind="link" className="size-4 text-slate-400 transition group-hover:text-emerald-600" />
              </div>
              <div className="mt-1.5 text-xs leading-5 text-slate-500">{starter.description}</div>
            </a>
          ) : (
            <button
              key={starter.key}
              type="button"
              disabled={!enabled || !starter.prompt}
              onClick={() => starter.prompt && onPrompt(starter.prompt)}
              className="group rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-900">
                {starter.label}
                <ActionGlyph kind="send" className="size-4 text-slate-400 transition group-hover:text-emerald-600" />
              </div>
              <div className="mt-1.5 text-xs leading-5 text-slate-500">{starter.description}</div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
