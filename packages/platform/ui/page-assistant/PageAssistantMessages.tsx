import { ActionGlyph } from "@workspace/core/ui";
import type { RefObject } from "react";

import type { AssistantMessage } from "./types";
import { proposalDiffText } from "./types";

type Props = {
  messages: AssistantMessage[];
  sending: boolean;
  busyProposalId: number | null;
  scrollRef: RefObject<HTMLDivElement | null>;
  settleProposal: (messageId: string, proposalId: number, action: "confirm" | "cancel") => void | Promise<void>;
};

/** @ui-specialized-surface Page Assistant message stream owns chat bubbles, attachments, and proposal settlement. */
export function PageAssistantMessages({
  messages,
  sending,
  busyProposalId,
  scrollRef,
  settleProposal,
}: Props) {
  return (
    <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-3">
      {messages.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 bg-white px-3 py-3 text-sm text-slate-500">
          当前会话为空。
        </div>
      ) : null}
      {messages.map((message) => (
        <article key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
          <div
            className={`max-w-[88%] rounded-lg px-3 py-2 text-sm leading-6 shadow-sm ${
              message.role === "user"
                ? "bg-emerald-600 text-white"
                : message.responseType === "error"
                  ? "border border-red-200 bg-red-50 text-red-800"
                  : "border border-slate-200 bg-white text-slate-800"
            }`}
          >
            <div className="whitespace-pre-wrap">{message.content}</div>
            <MessageAttachments message={message} />
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
      {message.proposalStatus === "pending" ? (
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
          {message.proposalStatus === "confirmed" ? "已确认" : "已取消"}
        </div>
      )}
    </div>
  );
}
